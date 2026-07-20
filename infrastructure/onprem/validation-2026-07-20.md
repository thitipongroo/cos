# On-prem K8s Linux POC — Results (2026-07-20)

Closes the **ADR-039 conditions** the macOS POC (`results-2026-06-30.md`) could not cover: air-gap
install, CIS hardening, full etcd snapshot-restore, and a k3s-vs-RKE2 head-to-head on real Linux.

- **Run by:** Claude Code session, product owner directing
- **Hosts:** 3 × Hyper-V Gen2 VM, **Ubuntu 24.04.4 LTS**, kernel `6.8.0-134-generic`, on one Windows 11
  host. Cloud image `ubuntu-24.04-server-cloudimg-amd64.img` (SHA256 verified against Ubuntu's
  `SHA256SUMS`), converted qcow2 → VHDX, seeded with cloud-init NoCloud ISOs.
- **Pinned versions:** k3s `v1.34.9+k3s1` · RKE2 `v1.34.9+rke2r1` · helm `v3.21.3` ·
  kube-bench `aquasec/kube-bench:latest`

## ⚠️ Deviations from spec — read before using these numbers

| Deviation | Detail | Effect on the result |
| --- | --- | --- |
| **Node sizing** | `§8.5` requires **3 × 16 vCPU / 64 GB / 500 GB NVMe**. Actual: **3 × 4 vCPU / 4 GB / 40 GB** (host has 16 cores / 31.8 GB total — spec sizing is physically impossible here). PO accepted this trade-off. | Functional results (does it install / fail over / restore / harden) are valid. **Capacity and timing numbers are NOT production-representative** — see RTO note below. |
| **Version choice** | First run used the *latest* (`v1.36.2`). Re-run on `v1.34.9` because **no CIS benchmark covers K8s 1.36** (kube-bench's newest is `cis-1.12`, targeting 1.32–1.34). | Version pinned to keep rubric 4 auditable. See "CIS tooling" finding. |
| **RKE2 coverage** | All rubric items were run on RKE2, including the node-loss drill on a full 3-node cluster. RKE2's etcd restore started from a genuine quorum loss on a **2-node** cluster (node3 had been repurposed at that moment), not a clean 3-node failure. | Restore timing is from a 2-node recovery; the failover drill is a full 3-node measurement. |
| **No image registry** | The environment has no registry, so images were side-loaded into each node's containerd with `ctr images import` and installed with `pullPolicy: Never`. | A real registry pull path (auth, TLS, mirrors) was never exercised. |
| **Node-failure simulation** | Node "failure" was Hyper-V `Stop-VM -TurnOff` (hard power cut). | Realistic, but it corrupted containerd's image store on the restarted node once (`exec format error`), needing an image re-pull. Production should drain nodes gracefully. |

## Rubric scoring (ADR-039)

| # | Criterion | k3s `v1.34.9+k3s1` | RKE2 `v1.34.9+rke2r1` (`profile: cis`) | Notes |
| --- | --- | --- | --- | --- |
| 1 | CNCF conformance + **COS Helm charts** | ✅ **PASS** — all 8 charts lint + server dry-run accepted; nginx 3/3 spread across nodes; `helm install` deployed | ✅ **PASS after the chart fix** — all 8 clean of PodSecurity violations; real apply creates Pods | initially FAILED; see blocker below |
| 2 | HA control plane (3-node etcd) | ✅ **PASS** — full drill | ✅ **PASS** — full drill (see below) | both survived 1-of-3 loss |
| 3 | **Air-gap install** | ✅ **PASS** — verified with egress blocked | ✅ **PASS** — `profile: cis`, egress blocked, images from tarball | RKE2 uses `INSTALL_RKE2_ARTIFACT_PATH`, not `SKIP_DOWNLOAD` |
| 4 | **CIS hardening** (`cis-1.12`) | 8 PASS / 61 FAIL / 62 WARN — **identical hardened or not** | **57 PASS / 18 FAIL** / 56 WARN | ⚠️ **not a like-for-like comparison** — see "CIS scores are not measuring k3s" |
| 5 | **etcd snapshot-restore** | ✅ **PASS** — RTO **90 s** | ✅ **PASS** — RTO **277 s** from real quorum loss | QM-12 target 30 min |
| 6 | Operational simplicity | k3s installs + reaches Ready in ~1 min/node | RKE2 slower (~10 min first node); **needs host sysctl prep** or it refuses to start | see script fix |
| 7 | License / cost | Apache-2.0 free | Apache-2.0 free | unchanged |
| 8 | In-house familiarity | high (dev) | low | unchanged |
| — | **FIPS** (RKE2) | n/a | ✅ **default binary is BoringCrypto** | see finding |

## 🚩 BLOCKER (FOUND, THEN FIXED THE SAME DAY) — COS Helm charts on CIS-hardened RKE2

> **Resolved.** `seccompProfile.type: RuntimeDefault` was added to the pod-level `securityContext` of
> all 8 charts and re-tested on the live RKE2 `profile: cis` cluster: no PodSecurity warning, and a
> real (non-dry-run) `cos-backend` apply **created Pods** (previously zero) with
> `{"fsGroup":1001,"runAsNonRoot":true,"runAsUser":1001,"seccompProfile":{"type":"RuntimeDefault"}}`
> admitted, and **no `FailedCreate` events**. The Pods then sit in `InvalidImageName` because the
> chart's default image is `:latest` with no repository — a values/registry gap, unrelated to
> admission. The original finding is kept below for the record.

RKE2 `profile: cis` enforces PodSecurity **`restricted:latest`** cluster-wide (exempt:
`kube-system`, `compliance-operator-system`, `tigera-operator`). All 8 COS charts set
`runAsNonRoot`, `allowPrivilegeEscalation: false` and `capabilities.drop: [ALL]`, but **none set
`seccompProfile`** — which `restricted` requires.

Proven by a **real** (not dry-run) apply of `cos-backend`:

```text
Warning: would violate PodSecurity "restricted:latest": seccompProfile (... must set
         securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")
deployment.apps/cos-backend-cos-backend created
# ...and then ZERO pods:
Error creating: pods "cos-backend-cos-backend-79b554864b-6x5sp" is forbidden:
  violates PodSecurity "restricted:latest": seccompProfile
```

The Deployment is admitted; the **ReplicaSet cannot create any Pod**. Confirmed absent in all 8
charts (`grep -rl seccompProfile infrastructure/helm/` → no matches).

**Consequence:** ADR-039's statement that "application artifacts (Helm charts, ArgoCD apps) are
identical across EKS and either on-prem distro" is **false for RKE2 with `profile: cis`** until the
charts add `seccompProfile.type: RuntimeDefault`. This is a one-line-per-chart fix, not a redesign.

## 🔬 CIS scores are not measuring k3s — read before quoting rubric 4

The 8-PASS/61-FAIL vs 57-PASS/18-FAIL gap looks damning for k3s. **It is an artifact of process
architecture, not a security gap.** Evidence, in order:

1. **k3s has no CIS profile switch.** `k3s server --help` on the v1.34.9 binary exposes
   `--protect-kernel-defaults` and `--secrets-encryption` but **no `--profile` flag at all** — unlike
   RKE2's one-line `profile: cis`. Hardening must be assembled by hand (`07-k3s-cis-harden.sh`).
2. **The hardening was applied and is demonstrably live:** `secrets-encrypt status` →
   `Encryption Status: Enabled, All hashes match`; the audit log grew to **21 MB**;
   and the apiserver refused to boot until `EventRateLimit` was configured — proving it consumed our
   `enable-admission-plugins=NodeRestriction,EventRateLimit`.
3. **Yet the scores did not move by a single check.** Hardened k3s scores **exactly** the same as
   default k3s: `cis-1.12` → 8/61/62, `k3s-cis-1.7` → 41/22/53/15.
4. **kube-bench reports false negatives.** It marks `1.2.15 Ensure that the admission control plugin
   NodeRestriction is set` as **FAIL** on a cluster where that plugin is provably loaded.
5. **Mechanism:** k3s runs the apiserver *in-process*. `/proc/<k3s-pid>/cmdline` contains **no**
   apiserver flags, and there are no static pod manifests. kube-bench detects configuration by
   reading process command lines and `/etc/kubernetes/manifests` — on k3s it finds neither, so it
   reports FAIL regardless of the real configuration. RKE2 scores well largely because it *does* lay
   out kubeadm-style static pods that kube-bench can read.

**Consequences:**

- A CIS score cannot be used as evidence of k3s hardening, and **the k3s-vs-RKE2 numbers must not be
  presented as a security comparison.**
- RKE2's hardening is nevertheless **independently evidenced** — its `profile: cis` genuinely enforces
  PodSecurity `restricted` cluster-wide (proven by Pods being rejected until the charts complied).
  That is a real control, verified by behaviour rather than by a scanner.
- For a regulated tenant needing an auditable CIS self-assessment, **RKE2 remains the right choice** —
  not because k3s is less secure, but because k3s's posture is not machine-attestable with current
  tooling.

## Findings that changed the POC scripts

1. **`02-cos-conformance.sh` gives a false PASS.** `kubectl apply --dry-run=server` on a *Deployment*
   only emits a PodSecurity **Warning** — it still reports "created". PSS is enforced at **Pod**
   admission. The script reported all 8 charts ✅ on RKE2 while no pod could ever start. Fixed to
   fail on `would violate PodSecurity`.
2. **`01-rke2-ha-install.sh` was missing the CIS sysctl step.** `profile: cis` makes rke2-server exit:
   `invalid kernel parameter value kernel.panic_on_oops=0 - expected 1 / vm.overcommit_memory=0 -
   expected 1 / kernel.panic=0 - expected 10`. RKE2 ships `/usr/local/share/rke2/rke2-cis-sysctl.conf`
   but does **not** apply it. Fixed: copy to `/etc/sysctl.d/` + `systemctl restart systemd-sysctl`.
3. **README §FIPS was wrong.** It said FIPS "requires the FIPS-specific RKE2 build/channel, not the
   default binary." The stock release binary reports:
   `rke2 version v1.34.9+rke2r1 ... go version go1.25.11 X:boringcrypto` — FIPS-validated BoringCrypto
   is compiled into the **default** build. Corrected.
4. **README port list was incomplete.** Missing `10250/TCP` (kubelet) for both distros, and for RKE2
   also `2381/TCP` (etcd metrics) and `30000-32767/TCP` (NodePort). Corrected from the official
   requirements pages.
5. **🚩 Four charts had health probes pointing at a path the service does not serve.** Only a real
   `helm install` with a real image exposed this — every dry-run and lint passed. `cos-ai-embedding-worker`
   ran fine (`uvicorn` up, `Application startup complete`) but the kubelet killed it in a loop:

   ```text
   GET /health HTTP/1.1" 404 Not Found
   Liveness probe failed: HTTP probe failed with statuscode: 404
   Container ai-embedding-worker failed liveness probe, will be restarted
   ```

   | chart | probed | service serves | |
   | --- | --- | --- | --- |
   | `cos-ai-embedding-worker` | `/health` | `/health/live` | ❌ fixed |
   | `cos-ai-gateway` | `/health` | `/health/live` | ❌ fixed |
   | `cos-ai-ocr-pipeline` | `/health` | `/health/live` | ❌ fixed |
   | `cos-analytics-worker` | `/healthz` | `/health/live` (`main.go:78`) | ❌ fixed |
   | `cos-backend` | `/health/live` | `/health/live` | ✅ |
   | `cos-file-service` | `/health/live` | **route not found in the repo** | ⚠️ unverified |
   | `cos-web` | `/api/health` | **route not found in the repo** | ⚠️ unverified |
   | `cos-kg-ingestion-worker` | — | — | no probes defined |

   After the fix: `STATUS: deployed`, Pod **1/1 Running, 0 restarts**, and `/health/live` returns
   `200 {"status":"ok","service":"ai-embedding-worker"}`. The two unverified charts were left alone —
   their health routes could not be located, so changing them would be guesswork.
6. **The k3s CIS hardening guide, followed verbatim, produces a cluster that will not boot.** It
   instructs `enable-admission-plugins=NodeRestriction,EventRateLimit` but its example admission file
   configures only PodSecurity, so the apiserver exits with
   `couldn't init admission plugin "EventRateLimit": limits: Invalid value: null: must not be empty`.
   `07-k3s-cis-harden.sh` adds the missing `limits` block.
7. **CIS tooling does not cover new Kubernetes.** kube-bench's newest generic benchmark is `cis-1.12`
   (K8s 1.32–1.34); distro-tailored ones are far older (`k3s-cis-1.7` → k3s 1.25–1.27,
   `rke2-cis-1.6` → rke2 1.25–1.27, and it produced no output at all on 1.34.9). **Shipping a K8s
   newer than 1.34 means no supported CIS self-assessment** — material for regulated tenants.
8. **Generic CIS is misleading for k3s.** `cis-1.12` scored k3s 8/61/62 on *both* 1.36.2 and 1.34.9 —
   identical, so the FAILs are not a version artifact. See the section above for the mechanism.
9. **`*.sh` needed `.gitattributes`.** The repo stores LF (`i/lf`) but a Windows checkout produced CRLF
   (`w/crlf`) and every script died with `/usr/bin/env: 'bash\r': No such file or directory`. It also
   made line-anchored `perl`/`sed` edits silently no-op. **Fixed** — `.gitattributes` now pins
   `*.sh`, Dockerfiles and YAML to `eol=lf`. 586 tracked files still have CRLF working copies; a
   `git add --renormalize .` would clear them in one commit.

## Evidence — what was actually run

**HA drill (k3s):** `Stop-VM -TurnOff` on node2 → `NotReady` in ~10 s → API `/readyz` = `ok` on 2/3
quorum → scaled deployment 3→4 **while a node was down** → self-healed to 4/4 in **283 s** (matches
the 5-min unreachable toleration), all pods on live nodes → node restarted → rejoined `Ready`,
3 etcd members.

**etcd snapshot-restore (k3s):** created ns `before-snap` + configmap → snapshot → created ns
`after-snap` → stopped peers, `--cluster-reset --cluster-reset-restore-path`, wiped peer `server/db`,
restarted → all 3 `Ready`. **RTO 90 s** (a second run on 1.36.2 measured 116 s).
Point-in-time correct: `before-snap` **Active**, marker = `before-snapshot`, `after-snap` **absent**.

**HA drill (RKE2, full 3 nodes, `profile: cis`):** `Stop-VM -TurnOff` on node2 → `NotReady` in **30 s**
→ API `/readyz` = `ok` on 2/3 quorum → scaled 3→4 **while a node was down** → self-healed to 4/4 in
**302 s**, all pods on live nodes → node restarted → rejoined `Ready` immediately, 3 etcd members.
The test workload needed an explicit `restricted`-compliant `securityContext` — plain `nginx:alpine`
is rejected outright on this cluster.

**Real `helm install` (RKE2 `profile: cis`):** `cos-ai-embedding-worker:verify` side-loaded into every
node's containerd (`ctr -n k8s.io images import`), installed with `pullPolicy: Never` and trimmed
resource requests to fit the undersized nodes. First attempt: helm timed out, Pod `0/1` with 4
restarts (the probe-path bug). After the chart fix: `STATUS: deployed`, Pod `1/1 Running`, 0 restarts,
`/health/live` → `200 {"status":"ok","service":"ai-embedding-worker"}`, admitted securityContext
`{"fsGroup":1001,"runAsNonRoot":true,"runAsUser":1001,"seccompProfile":{"type":"RuntimeDefault"}}`.

**Air-gap (k3s):** artifacts (`k3s`, `k3s-airgap-images-amd64.tar.zst`, `install.sh`) staged from a
connected host. Egress then blocked with iptables (allow lo + local /20 + ESTABLISHED, DROP rest) and
**proven**: `get.k3s.io` HTTP 200 before → timeout after; `registry-1.docker.io` timeout. Installed via
`05-k3s-airgap-install.sh install` (`INSTALL_K3S_SKIP_DOWNLOAD=true`). Result: node **Ready**, 5 pods
Running + 2 Completed, `crictl images` populated from the tarball, egress still blocked afterwards.

## Verdict

- **Default (k3s) confirmed for production on-prem?** **Yes** for rubrics 1, 2, 3, 5, 6, 7, 8 — all
  verified on Linux. Rubric 4 is **unmeasurable** for k3s: hardening was applied and proven live, yet
  the CIS score did not change by a single check because kube-bench cannot read k3s's in-process
  apiserver configuration. k3s is not shown to be *insecure*; it is shown to be *unattestable*.
- **RKE2 confirmed for CIS/FIPS-regulated tenants?** **Yes.** Every rubric item verified: conformance
  (after the chart fixes), full 3-node failover, air-gapped install with `profile: cis`, etcd restore
  (RTO 277 s), FIPS BoringCrypto in the stock binary, and a hardening posture evidenced by behaviour
  (PodSecurity `restricted` genuinely enforced) rather than by a scanner score.
- **Action:**
  1. ~~Add `seccompProfile` to the 8 charts~~ — **done**, verified on the live CIS cluster.
  2. ~~Run air-gap + etcd restore on RKE2~~ — **done**.
  3. ~~RKE2 node-loss drill; `helm install` with real images; k3s CIS hardening~~ — **done**.
  4. Decide the shipping K8s minor with CIS tooling coverage in mind (**≤ 1.34** today).
  5. **Still owed:** locate and verify the health routes for `cos-file-service` and `cos-web` (their
     probes are unverified); exercise a **real image registry** pull path (this POC side-loaded
     images); and re-run on `§8.5`-sized nodes if any timing number is to be quoted as production RTO.
