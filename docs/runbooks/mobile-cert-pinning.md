# Runbook — Mobile Certificate Pinning (security review L18)

**Status:** Not yet enabled — requires the production certificate's public-key pins (ops-provided).

## Why this is a runbook, not a code change

Certificate pinning hard-codes the SHA-256 hash of the production API server's certificate (or its public
key) into the app. Those pins are deployment-specific secrets-of-fact that this repo does not (and should
not) guess: shipping a wrong or placeholder pin **bricks the app** — every HTTPS request fails until a new
build is released. So the pins are supplied by whoever operates the production TLS certificate, and applied
per the steps below.

Current baseline (already in place): `apps/mobile/android/.../network_security_config.xml` permits cleartext
only for the emulator/localhost; production domains are HTTPS-only. Pinning is the additional defense.

## Step 1 — Obtain the pins (ops)

For the production API domain (`api.construction-os.app`) and the DR domain, capture the SPKI SHA-256 pin
of the **leaf** cert AND at least one **backup** pin (an intermediate or a spare key) so a cert rotation
does not require an app release:

```bash
# Leaf public-key pin
openssl s_client -connect api.construction-os.app:443 -servername api.construction-os.app < /dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary | openssl enc -base64
# Repeat for the issuing intermediate (backup pin).
```

## Step 2 — Apply (Android)

Add a `<pin-set>` to `network_security_config.xml` for the domain, with an expiration and BOTH pins:

```xml
<domain-config>
  <domain includeSubdomains="true">api.construction-os.app</domain>
  <pin-set expiration="2027-01-01">
    <pin digest="SHA-256">LEAF_PIN_BASE64=</pin>
    <pin digest="SHA-256">BACKUP_PIN_BASE64=</pin>
  </pin-set>
</domain-config>
```

## Step 3 — Apply (iOS)

Add the same pins via an `NSPinnedDomains` entry in `Info.plist` (or the pinning library in use).

## Step 4 — Rotation discipline

- Always keep a **backup pin** so a leaf-cert rotation does not require an app release.
- Set an `expiration` and track it — an expired pin-set fails open (pinning stops), so renew before it lapses.
- Test on a canary build against staging before shipping to production.

## Rollback

Remove the `<pin-set>` (Android) / `NSPinnedDomains` (iOS) and ship a build — the app falls back to the
system trust store (still HTTPS-only via the network security config).
