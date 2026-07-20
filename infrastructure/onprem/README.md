# On-premise Kubernetes — RKE2 install and compliance tooling

Operational tooling for the **production on-premise distribution: RKE2 with `profile: cis`**
(ADR-039, revised 2026-07-20). Every script here was executed against real Linux hosts on
2026-07-20; see `validation-2026-07-20.md` for what was measured and what was not.

> These began as POC scripts. They are kept because they are the **tested install and DR path** for
> the distribution COS actually ships on-premise — not as an experiment record.

## Scripts

| Script | Purpose | Run where |
| --- | --- | --- |
| `rke2-ha-install.sh` | Install a 3-server HA RKE2 cluster with the CIS profile. Applies the CIS sysctl drop-in the installer ships but does **not** apply itself — without it `rke2-server` refuses to start. | each server node; `ROLE=init` on the first, `ROLE=join` on the rest |
| `rke2-airgap-install.sh` | Offline install. `fetch` stages the artifacts from a connected machine; `install` consumes them via `INSTALL_RKE2_ARTIFACT_PATH` on a host with no egress. | connected host, then the air-gapped host |
| `etcd-snapshot-restore.sh` | etcd snapshot and restore drill — the **QM-12 DR procedure**. Measured RTO **277 s** against a 30-minute target. | the bootstrap server |
| `cis-scan.sh` | Run kube-bench against the cluster. Read `cis-exception-register.md` before interpreting the score. | any node |
| `verify-charts.sh` | Lint every COS Helm chart and server-dry-run it against the live API, **failing on PodSecurity violations**. A plain dry-run does not catch them: a Deployment that violates `restricted` is still admitted, and only its Pods are rejected. | control node with the repo present |

## Documents

- **`cis-exception-register.md`** — every kube-bench `[FAIL]` classified against on-host evidence.
  Verdict: **0 genuine misconfigurations**; 17 are scanner false negatives, 1 needs a documented
  exception. This is the working paper behind a CIS self-assessment — keep it current if the cluster
  configuration changes.
- **`validation-2026-07-20.md`** — the full validation record: HA and failover, air-gap, etcd restore,
  CIS, FIPS, and a real `helm install`. It also records the deviations that limit how the numbers may
  be quoted.

## Constraints you must not lose

- **Charts must keep `seccompProfile: RuntimeDefault`.** `profile: cis` enforces PodSecurity
  `restricted`; without it every Pod is rejected while the Deployment is still admitted — a silent
  failure.
- **Pin Kubernetes at 1.34 or older** while CIS compliance is required: kube-bench's newest benchmark
  (`cis-1.12`) covers 1.32–1.34 only.
- **FIPS wording.** The host OS in use (Ubuntu) is not a *tested* operating environment on either
  certificate (CMVP #4735, #4968). The defensible claim is *"uses the FIPS 140-3 validated
  BoringCrypto module on a user-ported operating environment"* — **never** "FIPS 140-3 validated".
- Line endings: these are `bash` scripts. `.gitattributes` pins `*.sh` to `eol=lf`; a CRLF checkout
  makes every one of them fail with `/usr/bin/env: 'bash\r': No such file or directory`.

## Not included

k3s tooling was removed with the POC. **k3s is dev-only** — it cannot produce a CIS self-assessment
at all (its apiserver runs in-process, so scanners cannot read its configuration; full hardening moved
the score by zero checks). Do not reintroduce it for production on-premise.
