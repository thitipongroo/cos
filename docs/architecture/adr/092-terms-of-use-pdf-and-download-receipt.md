# ADR-092: The Terms of Use gets a PDF, and its download button goes live

**Date:** 2026-08-18
**Status:** Accepted
**Deciders:** Product owner
**Tags:** mobile | api | legal

---

## Context

`mockup/mobile/01_authen/04_terms_of_use/` draws **two** screens. `01_terms_of_use_dashboard` is the
document — six clauses, two summary tiles, a pinned action bar with DOWNLOAD PDF and I AGREE TO ALL
TERMS — and is implemented at `(auth)/terms-of-use.tsx`. `02_terms_of_use_download` draws the receipt
that follows the download: a hexagonal success badge, "Download Complete", and a FILE METADATA card
carrying file name, size, SHA-256 and timestamp.

The second screen was not built. On **2026-08-09** the download button shipped **disabled**, for a
reason recorded in the screen and in `docs/specifications/32-implementation-specifications.md §32.7`:
there was no terms PDF anywhere in the repo and no endpoint to serve one, so the receipt could only
have shown invented figures. `§32.7` still said so as of 2026-08-18 — _"Terms of Use also gained a
second drawing, `02_terms_of_use_download`, which the app does not implement — the terms download is
still rendered disabled (2026-08-09)"_.

That reasoning was sound while it held and stopped holding the moment the same problem was solved
next door. **ADR-091 gave the Privacy Policy a real PDF** (2026-08-17): `policy-document.ts` holds
the prose, `PrivacyPolicyService` builds a byte-stable PDF with pdf-lib, two public routes serve it
and its digest, `lib/policyDownload.ts` verifies the bytes that land, and
`scripts/ci/check-policy-parity.mjs` fails the build if the screen and the PDF ever disagree. Every
piece the terms needed already existed as a working, tested pattern.

The product owner asked for both drawings to be implemented (2026-08-18).

## Decision

### 1. Build the terms PDF the same way the policy's is built

`backend/src/modules/identity/terms-of-use/` mirrors `privacy-policy/`: `terms-document.ts` holds the
prose and the version constants, `TermsOfUseService` renders it with pdf-lib and caches the result,
`TermsOfUseController` serves `GET /api/v1/terms/metadata` and `GET /api/v1/terms/pdf`. Both routes
are **public** — the terms are what a person reads before deciding to sign up, and a document you
must authenticate to read is not one they can act on.

The PDF is **deterministic**: no per-request input, and `CreationDate`/`ModDate` pinned to the
effective date rather than the clock. That is not tidiness — the receipt's integrity check compares
the client's digest against the one the server published, and that comparison means nothing unless
the same document always produces the same bytes.

`wrapLine` is imported from `PrivacyPolicyService` rather than copied. It is the subtle part (greedy
wrap against the font's _measured_ width, because Helvetica is proportional), it was already exported
for its own tests, and both documents live in the identity module.

### 2. One download implementation for both documents

`apps/mobile/src/lib/policyDownload.ts` became `legalDownload.ts`, parameterised by the document's two
routes: `downloadPolicy()` and `downloadTerms()` are thin wrappers over one `downloadDocument()`. The
digest step is where this flow can go quietly wrong — hashing the base64 _text_ instead of the bytes
it encodes produces a check that always fails, which teaches the reader to ignore it — so there is
one copy of it, under the existing tests.

`formatBytes` moved from `(auth)/privacy-policy-downloaded.tsx` to `lib/formatBytes.ts` for the same
reason, and gained tests: `src/lib` is inside the 100/100 coverage gate and `src/app` is not.

### 3. The parity check now covers both documents

`check-policy-parity.mjs` → **`check-legal-parity.mjs`**, comparing each backend document against the
i18n bundle its screen renders — version, effective date, and every sentence. Two legal texts held in
two places each is twice the drift risk, and the check is what makes that trade acceptable.

### 4. The receipt states a verdict the drawing does not

The drawing prints `SHA-256: 8a7f…e210` and nothing that says what it means. A hash with nothing to
compare it against is decoration, so the card carries the integrity verdict under it — the same line
the policy receipt shows, in the same two states. **This is the one place the screen says more than
the drawing**, and it is deliberate.

Everything the drawing states as fact is replaced by what is measured: `v4.2.0-STABLE` →
the real version (1.0.0), `COS_TERMS_STABLE.pdf` → `COS_Terms_of_Use_v1.0.0.pdf`, `1.2 MB` → the size
on disk, `June 10, 2024, 14:32` → when the download actually happened. ADR-091 made the same call on
the policy receipt.

### 5. The terms document screen is corrected against its own drawing

Three style differences were found while implementing and fixed (ADR-085 — the mockups are
authoritative for style):

| Element              | Drawing                                   | Was                       |
| -------------------- | ----------------------------------------- | ------------------------- |
| Top bar              | back + **TERMS OF USE**, no page heading  | wordmark + heading in the content |
| Summary tile accents | blue (STATUS) · `#4cd7f6` (AI USAGE)      | cyan · **amber**          |
| Clause 03 edge + numerals | blue edge; all six numerals one grey  | cyan edge; cyan numeral on 03 |

The bar change also settles a disagreement between two sibling screens: `(auth)/privacy-policy.tsx`
has carried its own title since it shipped. The `(app)` TopBar wordmark rule (2026-07-31) governs the
signed-in **shell**, and there is no shell out here.

### 6. Copy rulings taken during review (product owner, 2026-08-18)

Four calls made while walking the built screens against the drawing. Three cut copy the drawing
carries; the fourth reinstates something the drawing had and the first build dropped:

| Where                     | Drawing                             | Shipped                | Note                                                     |
| ------------------------- | ----------------------------------- | ---------------------- | -------------------------------------------------------- |
| AI USAGE tile             | ACTIVE MONITORING                   | MONITORING             | Thai value pending its own decision                      |
| Clause 03 title           | User Responsibilities (Site Safety) | User Responsibilities  | Also in the PDF — both halves cut, parity holds          |
| Action button             | I AGREE TO ALL TERMS                | AGREE TO ALL TERMS     | Thai needs no change; it carries no leading pronoun      |
| Receipt hash row          | `SHA-256: 8a7f...e210`              | same shape             | Reverses this ADR's own §4 note — see below              |

The last one is a reversal worth stating plainly. §4 argued for printing the whole 64-character
digest, because an abbreviated one cannot be compared against anything. The product owner ruled for
the drawing. The full value is therefore moved to the row's `accessibilityLabel` rather than dropped —
it stays recoverable, and the verdict line underneath still answers the question the digest was there
to answer. `lib/abbreviateDigest.ts` holds the shape (four characters, ellipsis, four characters) with
its own tests, including the case where a digest is too short to abbreviate and is returned whole.

The DOWNLOAD PDF label is uppercased in the stylesheet, not in the stored string — the rule the
product owner set on 2026-08-03 for the pre-auth bars: the i18n value stays natural, so a screen
reader says "Download PDF" instead of spelling it, and Thai renders unchanged because Thai has no case.

## Consequences

- **The 2026-08-09 "download stays disabled" decision is reversed**, and `§32.7`'s note recording it
  is updated rather than left to contradict the code.
- A second legal document now exists in two places (backend + i18n bundle). The parity check is the
  control; it fails the CI lint job on any disagreement, and it was verified to fail by breaking a
  sentence on purpose before this shipped.
- **The terms capture returns to `docs/screens/android/01-authen/04-terms-of-use/`**, reversing the
  2026-08-17 retirement (product-owner decision 2026-08-18) — the flow now has two screens and the
  document screen itself has changed, so what the retired frame documented is no longer what the app
  does. `capture-android-terms-of-use.mjs` is restored and extended to walk the download.
- Thai readers get an English PDF, as with the policy: pdf-lib's standard fonts carry no Thai glyphs
  and embedding a Thai face is an unmade font-licensing decision. `GET /terms/metadata` states this
  in `language` rather than leaving it to be discovered.
- **I AGREE TO ALL TERMS still records nothing** (2026-08-09, unchanged). Nothing in the platform can
  accept an acceptance: there is no terms-acceptance column or endpoint, and pre-auth there is not
  even a `user_id` to attach one to. That remains open.

## Alternatives considered

**Ship the receipt screen with figures from the drawing.** Rejected outright: a fabricated SHA-256 on
a legal document is worse than no receipt, and the platform's own rule against inventing what it does
not know is what ADR-091 was written to uphold.

**Bundle a static PDF as an app asset.** No server round-trip, but the file would then be whatever was
committed, with no published digest to verify against and no way to correct an edition without an app
release. The policy already rejected this.

**Leave the button disabled and implement only the document screen's style fixes.** Offered to the
product owner as the smaller option on 2026-08-18 and declined.
