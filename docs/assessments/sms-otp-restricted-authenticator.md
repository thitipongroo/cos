# Construction OS — SMS OTP as a Restricted Authenticator (NIST SP 800-63B Rev 4)

> **Purpose:** the documented risk assessment, migration roadmap and user notification that
> NIST SP 800-63B Rev 4 requires of any organisation that continues to use a **restricted**
> authenticator. Rev 4 classifies SMS/PSTN one-time passcodes as restricted, and they no longer
> satisfy AAL2.
>
> **Scope:** authentication **Path A** — phone number + SMS OTP (`05-security-compliance` §5.4.2).
>
> Implemented in:
>
> - `backend/src/modules/identity/otp/otp.service.ts` — OTP mint, store, verify, rate limits
> - `backend/src/modules/identity/otp/sms-sender.ts` + `adapters/` — delivery (AWS SNS in cloud;
>   pluggable provider on-premise, ADR-040)
> - `backend/src/modules/identity/keycloak-admin.service.ts` — Direct Grant token exchange after
>   verification; Keycloak signs the token, the ephemeral credential is discarded

---

## 1. Why this document exists

Rev 4 of SP 800-63B introduced an explicit **restricted authenticator** category and put SMS/PSTN
OTP in it, on the strength of SIM-swap and interception risk. A restricted authenticator may still be
used, but the organisation must:

| NIST obligation                 | Where it is discharged |
| ------------------------------- | ---------------------- |
| Documented risk assessment      | § 3 of this document   |
| Migration roadmap               | § 4                    |
| Notify users of the restriction | § 5                    |

A second consequence matters independently of the paperwork: **a phone-plus-OTP login is a single
factor** (possession), so it reaches AAL1, not AAL2. AAL2 needs two distinct factors.

## 2. Who authenticates this way

Per `05-security-compliance` §5.4.4, both paths are open to every role **except `TENANT_ADMIN` and
`FINANCE`**, which are **Path B only** and are refused on Path A at the identity provider
(`docs/runbooks/mfa-enforcement.md` Step 1b, verified 2026-08-22).

So the population authenticating with a restricted authenticator is **every role that is not
`TENANT_ADMIN` or `FINANCE`** — in practice the field roles the path was built for, plus any other
role whose account carries a phone number. Those two privileged roles, which QM-4 requires to hold
MFA, are structurally excluded. That exclusion is the single largest mitigation in this document and
it is enforced, not advisory.

## 3. Risk assessment

### 3.1 Threats

| ID  | Threat                                                                      | Why it applies to SMS specifically                                                                  |
| --- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| T1  | **SIM swap** — attacker ports the number to a SIM they control              | The passcode is delivered to the number, not the device; carrier process is out of platform control |
| T2  | **SS7 / network interception** of the message in transit                    | PSTN delivery is unauthenticated end to end                                                         |
| T3  | **Device-level disclosure** — lock-screen preview, shared handset           | Field handsets are shared across shifts by design (ADR-017 Context)                                 |
| T4  | **Brute force** of the 6-digit code                                         | 10⁶ space; only rate limits and TTL stand between an attacker and a guess                           |
| T5  | **OTP flooding / cost abuse** — requesting codes for a number               | Each send costs money and annoys the number's owner                                                 |
| T6  | **Single-factor account takeover** — possession alone grants a full session | There is no second factor on this path                                                              |

### 3.2 Controls that exist

Each row was read out of the implementation, not out of a specification.

| Control                                                  | Value                                | Where                                           | Mitigates    |
| -------------------------------------------------------- | ------------------------------------ | ----------------------------------------------- | ------------ |
| Code length / TTL                                        | 6 digits, **300 s**                  | `otp.service.ts` `OTP_TTL_SECONDS`              | T2, T4       |
| Verify attempts per code                                 | **3**                                | `otp.service.ts` `OTP_MAX_ATTEMPTS`             | T4           |
| Resend cooldown per phone                                | **60 s** (429 + `retryAfterSeconds`) | `otp.service.ts` `RESEND_COOLDOWN_SECONDS`      | T5           |
| Request budget per phone                                 | **10 / day**                         | `otp.service.ts` (Redis `INCR`, TTL-preserving) | T4, T5       |
| Endpoint rate limit                                      | **10 req/min per IP**                | `@Throttle` on `IdentityController` — QM-7 tier | T4, T5       |
| Privileged roles excluded from the path                  | `TENANT_ADMIN`, `FINANCE`            | Keycloak Direct Grant flow denies (ADR-067)     | T1, T6       |
| Token is Keycloak-signed; ephemeral credential discarded | RS256                                | `keycloak-admin.service.ts` (§5.4.2 step 4)     | T6           |
| Auth events audited                                      | immutable audit log                  | §5.9.2                                          | T1, T3, T6   |
| Delivery-rate fallback                                   | Thai fallback below 95% on +66       | §5.4.2                                          | availability |

**What those limits add up to against T4.** The daily budget counts **sends**, not failed guesses
(`otp.service.ts` claims the slot before the send and refunds it if the gateway fails), and each code
allows 3 tries. So one phone number admits at most **10 × 3 = 30 guesses per day** against a 10⁶
space — roughly a 3 × 10⁻⁵ chance per day per number, and each attempt requires a fresh code the
attacker cannot read. That is comfortably inside the throttling Rev 4 expects of a look-up-secret-like
authenticator. **T4 is adequately mitigated; T1 and T3 are not, and they are the reason SMS is
restricted.**

**Two implementation notes, recorded rather than smoothed over:**

- The OTP is stored in Redis as the **raw value**, not a hash. `otp.service.ts` states the reasoning:
  Redis is ephemeral with a 5-minute TTL and is never persisted to disk, so confidentiality rests on
  Redis access control plus the short TTL. This is a deliberate trade, and it means a Redis
  compromise is an OTP compromise for the length of the window.
- **Device Trust (ADR-081) is not a control here.** It is advisory by design: it never revokes a
  device and never blocks a login, and until the model beats its rule-based baseline the score is not
  even AI-derived. It may inform review; it does not stop T1.

### 3.3 QM-7's account lockout — where it applies, and where it does not

QM-7 (`.claude/rules/qm-07-rate-limiting.md`) requires of authentication endpoints: "10 req/min per IP (brute force
protection); account lockout after 5 consecutive failures for 15 minutes."

**On Path B the lockout exists**, in the place that owns the credential.
`infrastructure/keycloak/realms/construction-os-realm.json` sets:

| Realm setting           | Value   | QM-7 clause                  |
| ----------------------- | ------- | ---------------------------- |
| `bruteForceProtected`   | `true`  | account lockout              |
| `failureFactor`         | `5`     | after 5 consecutive failures |
| `maxFailureWaitSeconds` | `900`   | for 15 minutes               |
| `waitIncrementSeconds`  | `60`    | —                            |
| `permanentLockout`      | `false` | temporary, not permanent     |

One detail worth stating exactly rather than rounding: with `waitIncrementSeconds: 60`, the lock
begins at the fifth failure and the wait _grows_ from 60 s, capping at the 900 s `maxFailureWait`.
That is not literally "15 minutes on the fifth failure", but it is a faithful implementation of the
clause and a stricter one early on.

**On Path A it does not apply, and the reason is structural.** A wrong OTP never reaches Keycloak:
`OtpService.verifyOtp` compares against the Redis-held value and throws locally, and
`KeycloakAdminService` is called only _after_ a verification succeeds, to mint the token. So no
Keycloak failure counter increments for a failed SMS OTP, and no account lock follows from one.

What bounds Path A instead is the arithmetic in § 3.2: 3 attempts per code × 10 codes per day = **30
guesses per day per number** against a 10⁶ space, each requiring a fresh code the attacker cannot
read. QM-7's other clause — 10 req/min per IP — **is** enforced on Path A, by the `@Throttle` on
`IdentityController`.

#### Risk accepted — Path A gets no account lockout of its own

**Product-owner decision, 2026-08-22 ([OQ-17](../architecture/technical-design/README.md), now closed).** Path A
keeps the controls it has. No per-account lock will be added.

The reasoning, recorded so a later reviewer does not have to reconstruct it:

- **The clause's purpose is already served.** A lockout exists to stop guessing being profitable. Here
  guessing is bounded at 30 attempts per day per number against a 10⁶ space — about 3 × 10⁻⁵ per day
  — and, unlike a password, **each attempt needs a fresh code the attacker cannot read**. A lock would
  reduce an already negligible number.
- **A lock would create a worse risk than it removes.** Locking an account after five wrong OTPs means
  anyone who knows a worker's phone number can lock them out for fifteen minutes, repeatedly, from
  anywhere. SMS OTP is the **only** login a `SITE_WORKER` has (§ 5.4.4), so that is not a degraded
  session — it is no access to the site app at all, for a population that uses it to report safety
  incidents and log attendance. The attacker needs no secret and takes no risk.
- **What is actually at stake is unchanged.** The threats SMS is restricted _for_ are T1 (SIM swap)
  and T3 (SS7 / operator interception), and a lockout does nothing about either — an attacker
  receiving the victim's messages enters the correct code on the first try. § 3.4's residual risk is
  the honest statement of the exposure, and it is untouched by this decision.

**This acceptance is bounded, not permanent.** It is scoped to Path A, to a population that excludes
`TENANT_ADMIN` and `FINANCE` (§ 3.2), and to the current limits — if `OTP_MAX_ATTEMPTS` or the daily
budget is raised, the arithmetic above no longer holds and this must be revisited. § 6's review
schedule covers it, and the migration in § 4 supersedes it.

> **Correction, 2026-08-22.** This section previously said the lockout was "not implemented — on any
> authentication path". That was wrong: it was concluded from a search of `backend/src`, which is not
> where Path B authentication happens. The realm file was not checked. The Path A half of the finding
> stands; the Path B half did not.

### 3.4 Residual risk

With the privileged roles excluded, the exposure is: **an attacker who controls the victim's phone
number obtains a full session as a non-privileged role.** RBAC and ABAC bound what that session can
do — a `SITE_WORKER` cannot approve a PO, read finance, or administer the tenant (§6.4, §6.8) — and
RLS bounds it to one tenant. The platform accepts this risk for the field population because the
alternative, a password a gloved worker must recall on a shared handset in sunlight, was assessed in
ADR-017 as the larger adoption _and_ security risk.

**This acceptance is scoped and revisited** — see § 6.

## 4. Migration roadmap

**The target and the date are a product-owner decision and are not set here.** What this section
records is what already exists to migrate _onto_, and what a migration would have to cover.

**Already available.** Keycloak-native TOTP with enrolment through the Application-Initiated Action
`kc_action=CONFIGURE_TOTP` is built and in use for privileged roles (ADR-074), and the realm's
`acr.loa.map` already distinguishes a base level from an OTP level, so a token can prove which factors
ran. Adding a second factor for a Path A population is therefore configuration plus enrolment UX, not
new authentication machinery.

**What a migration must answer, in this order:**

1. **Target authenticator.** TOTP is available today. NIST's own preference is phishing-resistant
   (FIDO2/WebAuthn, passkeys), which this platform has not evaluated — no ADR covers it.
2. **Feasibility on the field population.** A shared handset changes what an authenticator app means.
   ADR-017's Context is the record of why passwords were rejected for these users; the same analysis
   has not been done for TOTP or passkeys.
3. **Sequencing.** Whether SMS becomes the fallback behind a stronger factor, or is retired.
4. **Interim hardening**, which does not depend on 1–3. The § 3.3 lockout gap is NOT part of this:
   it was assessed and accepted on 2026-08-22, for the reasons recorded there. What remains open is
   the § 5 user notification, which NIST requires and which does not exist yet.

## 5. User notification

NIST requires that users of a restricted authenticator be told. **Not yet implemented.** The notice
must state that SMS delivery is used, that it carries the risks in § 3.1, and that the platform
intends to migrate. Requirements when it is built:

- Shown on the Path A login surface — where the person is choosing to use it
- Translated through i18n keys like every other user-facing string (QM-3)
- Carried in both apps' Path A flows, not only web

## 6. Review

| Trigger                                             | Action                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------------------------- |
| Annually                                            | Re-assess against the current SP 800-63B revision                               |
| Before each Stage transition                        | Re-confirm the risk acceptance in § 3.4 with the product owner                  |
| A SIM-swap or interception incident on any tenant   | Immediate re-assessment; the acceptance in § 3.4 does not survive a realised T1 |
| Any change to §5.4.4 that widens who may use Path A | Re-scope § 2                                                                    |

Related: `05-security-compliance` §5.4.2 (mechanism), §5.4.4 (who may use it), §5.9.2 (STRIDE for
this surface), ADR-017 (why the path exists), ADR-067 (why privileged roles are excluded),
`docs/runbooks/mfa-enforcement.md` (how that exclusion is enforced).
