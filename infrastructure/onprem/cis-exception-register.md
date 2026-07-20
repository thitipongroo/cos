# RKE2 CIS Exception Register — `cis-1.12` on RKE2 v1.34.9+rke2r1 (`profile: cis`)

Every `[FAIL]` kube-bench reported, classified **with on-host evidence**. This is the working paper
behind a CIS self-assessment; it is not itself a certified assessment.

- **Scanned:** kube-bench `aquasec/kube-bench:latest`, `--benchmark cis-1.12`
- **Target:** RKE2 `v1.34.9+rke2r1`, `profile: cis`, single server node, Ubuntu 24.04.4
- **Result:** 57 PASS / **18 FAIL** / 56 WARN
- **Verdict after investigation:** **0 genuine misconfigurations. 17 false negatives, 1 requiring a
  documented exception.**

> ⚠️ Two limits on how far this document can be used as-is:
>
> 1. The contract calls for the **latest** CIS Kubernetes Benchmark — **v2.0.1**. kube-bench supports
>    **v1.12 at most**, so this register is against v1.12, not what was asked for.
> 2. The host OS is **Ubuntu**, which is not a *tested* operating environment on either FIPS
>    certificate (#4735, #4968). See `results-2026-07-20-linux.md`.

## Why 17 of 18 are false negatives

kube-bench detects configuration by reading **process command lines** and **kubeadm file paths**
(`/etc/kubernetes/admin.conf`, `/etc/systemd/system/kubelet.service.d/10-kubeadm.conf`, `/var/lib/etcd`).
RKE2 uses none of those: manifests live under `/var/lib/rancher/rke2/agent/pod-manifests`, etcd runs
as `etcd --config-file=…`, and the kubelet is configured by a drop-in file rather than flags. The
scanner finds nothing at the paths it expects and reports FAIL.

**Demonstration:** CIS 1.1.13 wants the admin credential file at `600`. kube-bench's own remediation
text names `/etc/kubernetes/admin.conf` — a path that **does not exist** on RKE2. The real credential,
`/var/lib/rancher/rke2/server/cred/admin.kubeconfig`, is **already `600 root:root`**. The check was
re-run after tightening file permissions and **still reported FAIL**, confirming it is not reading the
live configuration at all.

## 1. False negatives — verified compliant on the host (17)

### File permissions and ownership

| Check | Requirement | **Observed** | Path actually inspected |
| --- | --- | --- | --- |
| 1.1.7 | etcd pod spec `600` | **`600`** | `/var/lib/rancher/rke2/agent/pod-manifests/etcd.yaml` |
| 1.1.8 | etcd pod spec `root:root` | **`root:root`** | same |
| 1.1.11 | etcd data dir `700` | **`700`** | `/var/lib/rancher/rke2/server/db` |
| 1.1.12 | etcd data dir `etcd:etcd` | **`etcd:etcd`** | `/var/lib/rancher/rke2/server/db/etcd` |
| 1.1.13 | admin credential `600` | **`600 root:root`** | `/var/lib/rancher/rke2/server/cred/admin.kubeconfig` (kube-bench looks for the absent `/etc/kubernetes/admin.conf`) |
| 1.1.14 | admin credential `root:root` | **`root:root`** | same |
| 1.1.19 | PKI dir `root:root` | **`700 root:root`** | `/var/lib/rancher/rke2/server/tls` |
| 4.1.1 | kubelet service file `600` | **N/A** | wants `10-kubeadm.conf`; RKE2 has no separate kubelet service — the kubelet is a child of `rke2-server` |
| 4.1.9 | kubelet config `600` | **dir `700 root:root`, file `600 root:root`** | `/var/lib/rancher/rke2/agent/etc/kubelet.conf.d/00-rke2-defaults.conf` |

### etcd TLS — all four flagged settings present

From `/var/lib/rancher/rke2/server/db/etcd/config`, the file named by `etcd --config-file=`:

```yaml
# client
cert-file:        /var/lib/rancher/rke2/server/tls/etcd/server-client.crt
key-file:         /var/lib/rancher/rke2/server/tls/etcd/server-client.key
client-cert-auth: true
trusted-ca-file:  /var/lib/rancher/rke2/server/tls/etcd/server-ca.crt
# peer
cert-file:        /var/lib/rancher/rke2/server/tls/etcd/peer-server-client.crt
key-file:         /var/lib/rancher/rke2/server/tls/etcd/peer-server-client.key
client-cert-auth: true
trusted-ca-file:  /var/lib/rancher/rke2/server/tls/etcd/peer-ca.crt
```

| Check | Requirement | Observed |
| --- | --- | --- |
| 2.1 | `--cert-file` and `--key-file` set | **both set** |
| 2.2 | `--client-cert-auth=true` | **`true`** |
| 2.4 | `--peer-cert-file` and `--peer-key-file` set | **both set** |
| 2.5 | `--peer-client-cert-auth=true` | **`true`** |

### Kubelet — from the live `/configz` endpoint

`kubectl get --raw /api/v1/nodes/<node>/proxy/configz` — the kubelet's own effective configuration,
authoritative over any command line:

| Check | Requirement | **Observed** |
| --- | --- | --- |
| 4.2.1 | `--anonymous-auth=false` | `"anonymous":{"enabled":false}` |
| 4.2.2 | authorization mode not `AlwaysAllow` | `"authorization":{"mode":"Webhook"}` |
| 4.2.3 | `--client-ca-file` set | `clientCAFile: /var/lib/rancher/rke2/agent/client-ca.crt` |
| 4.2.6 | `--make-iptables-util-chains=true` | `makeIPTablesUtilChains: true` |

## 2. Requires a documented exception (1)

| Check | Requirement | Observed | Proposed exception |
| --- | --- | --- | --- |
| **4.2.10** | `--rotate-certificates` **not set to `false`** | The field is **absent** from `/configz` and from `00-rke2-defaults.conf` — it is not set to `false`, it is not set at all. RKE2 instead pins the kubelet serving certificate explicitly (`tlsCertFile: …/serving-kubelet.crt`, `tlsPrivateKeyFile: …/serving-kubelet.key`) and manages the certificate lifecycle itself (`rke2 certificate rotate`). | The literal requirement ("not set to `false`") is met. The **intent** — automatic certificate rotation — is met by RKE2's own mechanism, which kube-bench does not recognise. **This POC did not establish the kubelet's built-in default for `rotateCertificates` in v1.34**, so the exception should be confirmed with SUSE/Rancher rather than asserted. |

## 3. Hardening applied during this review

Not a CIS finding, but a genuine weakness found while investigating 1.1.13:

`01-rke2-ha-install.sh` wrote `write-kubeconfig-mode: "0644"`, leaving
`/etc/rancher/rke2/rke2.yaml` — which contains **admin credentials** — world-readable. Changed to
default `0600` (override with `KUBECONFIG_MODE`). Verified: the file is now `600 root:root`.
Note this did **not** change the CIS score, because kube-bench never inspects that file.

## Recommended next steps

1. **Confirm 4.2.10 with SUSE/Rancher** — the only item not settled by direct observation.
2. **Decide how to satisfy "latest CIS Benchmark".** kube-bench cannot assess v2.0.1. Either assess
   v2.0.1 manually against the evidence base above, or use tooling that supports it (CIS publishes
   automated assessment content to SecureSuite members; Kubernetes coverage **not verified here**).
3. **Resolve the operating-environment question** for the FIPS side — see the ADR.
