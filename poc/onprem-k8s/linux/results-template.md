# On-prem K8s Linux POC — Results (template)

Fill one column per distro. Closes the ADR-039 conditions + the rubric items the macOS POC left open.

- **Date:** `<YYYY-MM-DD>`  ·  **Run by:** `<name>`  ·  **Hosts:** `<3× OS/version, sizing>`
- **Pinned versions:** k3s `<vX.Y.Z+k3s1>` · RKE2 `<vX.Y.Z+rke2r1>` · kube-bench `<tag/digest>`

## Rubric scoring (ADR-039)

| # | Criterion | k3s | RKE2 | Notes |
| --- | --- | --- | --- | --- |
| 1 | CNCF conformance + COS Helm charts accepted (`02`) | `<P/F>` | `<P/F>` | |
| 2 | HA control plane — 3-node etcd, survives 1-node loss (`01`) | `<P/F>` | `<P/F>` | |
| 3 | **Air-gap install** (README §Air-gap) | `<P/F>` | `<P/F>` | record artifacts/version used |
| 4 | **CIS hardening** — kube-bench (`04`) | `<#PASS/#FAIL/#WARN>` | `<#PASS/#FAIL/#WARN>` | RKE2 `profile: cis` expected to score higher |
| 5 | **etcd snapshot-restore** — RTO/RPO (`03`) | `<restore time>` | `<restore time>` | compare to QM-12 on-prem target |
| 6 | Operational simplicity | `<notes>` | `<notes>` | install/upgrade/restore effort |
| 7 | License / cost | Apache-2.0 free | Apache-2.0 free | (RKE2 optional paid SUSE support) |
| 8 | In-house familiarity | high (dev) | low | |
| — | **FIPS** (RKE2 only, if a regulated tenant requires) | n/a | `<tested? build used?>` | needs RKE2 FIPS build (README §FIPS) |

## Verdict

- **Default (k3s) confirmed for production on-prem?** `<yes/no — rationale>`
- **RKE2 confirmed for CIS/FIPS-regulated tenants?** `<yes/no — rationale>`
- **Action:** update `08-enterprise-deployment` §8.5 + ADR-039 (clear the Conditions); if either distro
  fails a hard criterion, re-open ADR-039 with the finding.
