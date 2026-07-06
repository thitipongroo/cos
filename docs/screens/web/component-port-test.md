---
title: Construction OS — Web Component Port · Browser-Compat Test Checklist
last_updated: '2026-07-05'
---

# Web Component Port — Browser-Compat Test Checklist

> Part of [`docs/screens/`](../README.md). Verification checklist for porting the six
> **feature components** from the Figma mockup (`figma/mockup/`) into the web app
> (`apps/web`). Every case below is tied to a browser API read directly from the mockup
> source — not assumed.

## Scope

Six components + their two service hooks were read in full:

| Component | Source file | Browser API used (verified) |
| --- | --- | --- |
| `ImageWithFallback` | `.../components/figma/ImageWithFallback.tsx` | `<img onError>` + inline data-URI SVG |
| `LoadingState` | `.../components/mobile/LoadingState.tsx` | none — CSS only (`animate-pulse` / `animate-spin`) |
| `AdvancedPhotoCapture` | `.../components/camera/AdvancedPhotoCapture.tsx` | `<input type=file capture>`, `URL.createObjectURL`, `fetch(blob)`→`File` |
| `PhotoAnnotation` | `.../components/camera/PhotoAnnotation.tsx` | Canvas 2D (`getContext`/`drawImage`/`getImageData`/`toBlob`), `new Image()`, mouse+touch |
| `VoiceInput` | `.../components/voice/VoiceInput.tsx` + `services/speech.service.ts` | `(webkit)SpeechRecognition` |
| `LocationDisplay` | `.../components/location/LocationDisplay.tsx` + `services/location.service.ts` | `navigator.geolocation`, `localStorage`, `fetch → nominatim.openstreetmap.org` |

`LoadingState` exports `SkeletonCard` / `LoadingSpinner` / `EmptyState`.

**Target platform:** tablet/laptop browser (web is not smartphone, per spec `13`/`20`).

## 0. Prerequisites (do before any run)

- [ ] Serve over **HTTPS or `localhost`** — geolocation / SpeechRecognition / camera require a
  secure context; on plain HTTP the APIs never fire.
- [ ] `lucide-react` is installed in `apps/web` (**verified missing today**) — all six components
  import it; without it they fail to build.
- [ ] Reset site permissions (Location / Microphone / Camera) to **Ask** so the permission
  grant/deny paths are exercised.
- [ ] Design tokens re-themed: mockup uses `--mobile-*` / `--text-*` / `--touch-*`
  (React-Native-only per `apps/web/src/app/globals.css`). Confirm computed styles resolve to
  `§32.7` web tokens (`--cos-*`, `--web-radius-*`). `ImageWithFallback` is the only zero-token one.

## 1. Browser matrix

| Browser | Why it must be tested |
| --- | --- |
| Chrome / Edge (desktop) | Primary target; `SpeechRecognition` supported. |
| Safari (macOS + iPad) | webkit prefix; validates tablet target + `capture` behaviour. |
| Firefox (desktop) | **Verified: no `SpeechRecognition`** → must show the graceful fallback, not crash. |

## 2. Per-component cases

### ImageWithFallback — 🟢 automatable

- [ ] Valid `src` → image renders (all browsers).
- [ ] Broken/404 `src` → `onError` swaps to the SVG fallback; fallback `<img>` has
  `alt="Error loading image"` and the original URL is preserved on `data-original-url`.
- [ ] No lingering console error.

### LoadingState — 🟢 automatable

- [ ] `SkeletonCard` animates (`.animate-pulse`).
- [ ] `LoadingSpinner` animates (`.animate-spin`) at `sm`/`md`/`lg`.
- [ ] `EmptyState` renders title + description; action button fires `onAction`.
- [ ] After re-theme: spinner colour comes from `--cos-*`, not `--mobile-primary`.

### AdvancedPhotoCapture — 🟡 partly manual

- [ ] Click "Take Photos" → opens file picker.
- [ ] **Desktop**: `capture="environment"` is ignored → normal file dialog (must not break).
- [ ] **iPad/tablet Safari**: does `capture` open the rear camera? — **observe on a real device.**
- [ ] `multiple` selection → grid preview via `URL.createObjectURL`.
- [ ] Over `maxPhotos` → button disabled + "Maximum N photos".
- [ ] Remove photo → leaves grid; `onPhotosChange` fires.
- [ ] After annotate → `fetch(annotatedUrl)`→blob→`File`; "✓ Annotated" badge shows.

### PhotoAnnotation — 🟡 partly manual (canvas)

- [ ] **Desktop (mouse)**: press-drag draws (`onMouseDown/Move/Up`).
- [ ] **iPad (touch)**: touch-drag draws (`onTouchStart/Move/End`); `touch-none` stops page scroll.
- [ ] Colour / line-width slider affects subsequent strokes.
- [ ] Text tool: tap position → `fillText` at that point.
- [ ] Undo steps back via `putImageData`; disabled at the last remaining state.
- [ ] Save → `canvas.toBlob` returns a PNG blob.
- [ ] **CORS (critical)**: annotate a **remote image with no CORS header** then Save → expect
  `toBlob` to **throw (tainted canvas)**; with `Access-Control-Allow-Origin` present → passes.
  Confirms storage-CORS must be controlled.

### VoiceInput — 🟠 policy + partly manual

- [ ] **Chrome/Edge**: "Tap to Speak" → mic permission prompt → transcript (interim + final).
- [ ] **Safari**: works? (webkit prefix) — **observe on a real device.**
- [ ] **Firefox**: **verified** → must show "Voice input not supported in this browser" (no crash).
- [ ] Deny mic → error banner (`bg-red-50`), listening state cleared. **On real browsers only** —
  see the verified note in §4 (headless Chromium does not deny the mic).
- [ ] Language picker changes `recognition.lang`. **Gap: the languages list has no `th` (Thai)** —
  10 languages, Thai absent.
- [ ] **Privacy**: confirm Chrome ships audio off-device (DevTools network) → policy decision.

### LocationDisplay — 🔴 core fix required

- [ ] "Get Location" → permission prompt → returns lat/lng/accuracy.
- [ ] Deny permission → "Location permission denied" (`PERMISSION_DENIED`).
- [ ] On plain HTTP → API inert → confirms HTTPS requirement.
- [ ] **Reverse-geocode (critical)**: DevTools Network shows a call to
  `nominatim.openstreetmap.org` with the `User-Agent` header **dropped** (browsers forbid setting
  it) and subject to rate-limit → address falls back to "Unknown location". **Confirms
  `reverseGeocode` must be replaced with a COS backend endpoint before production** (external call
  also leaks site coordinates to a third party). The `getCurrentPosition` call itself is fine.

## 3. Cross-cutting

- [ ] **PWA/offline (Serwist)**: offline → network-dependent components (VoiceInput,
  LocationDisplay reverse-geocode) degrade without crashing.
- [ ] **Dark mode** (`<html class="dark">`): text legible in both themes after re-theme.
- [ ] **i18n**: mockup strings are hardcoded English ("Take Photos", "Listening…", "Current
  Location"). Port must route through `useI18n().t(...)`. **Gap: mockup does not use i18n.**
- [ ] **Console/network**: no errors; no unintended external calls (especially Nominatim).

## 4. Automatable vs manual (for the Playwright spec)

| Area | Automatable | Reason |
| --- | --- | --- |
| ImageWithFallback fallback | ✅ yes | Deterministic `onError`. |
| LoadingState render + EmptyState action | ✅ yes | Pure DOM/CSS. |
| LocationDisplay permission **denied** | ✅ yes | `context.clearPermissions()` + assert denied text. |
| LocationDisplay granted (positive control) | ✅ yes | `grantPermissions` + `setGeolocation`; Nominatim aborted via `context.route`. |
| VoiceInput render + listening transition | ✅ yes | **Verified**: headless Chromium exposes `(webkit)SpeechRecognition`; `start()` succeeds → assert listening state. |
| VoiceInput mic-**denied** error path | ❌ manual | **Verified**: headless Chromium does not deny the mic (`start()` succeeds, no error) → banner never fires. |
| VoiceInput live transcription | ❌ manual | No real audio in CI; Chromium speech uses Google servers. |
| Camera capture, canvas drawing, real GPS fix | ❌ manual | Need real device sensors / grantable hardware. |

The automatable rows are covered by
[`tests/e2e/specs/component-port.spec.ts`](../../../tests/e2e/specs/component-port.spec.ts).

> **Precondition:** the six components are **not yet ported** into `apps/web` (verified). The
> Playwright spec is **gated behind `COMPONENT_PREVIEW_URL`** and skips until a preview route
> mounts them with the `data-testid`s documented in the spec header. It does not pretend to pass
> before the port.

### Verified run (2026-07-05)

Ran against the mockup components rendered by a Vite preview harness
(`figma/mockup/preview.html` → `src/app/ComponentPreview.tsx`), which mounts them with the
`data-testid` contract:

```bash
BASE_URL=http://localhost:5199 COMPONENT_PREVIEW_URL=/preview.html \
  npx playwright test component-port --config tests/e2e/playwright.config.ts
# → 6 passed (5.0s), chromium headless
```

This exercises the **mockup source** components (native `--mobile-*` tokens).

### Verified run — apps/web port (2026-07-05)

`ImageWithFallback` + `LoadingState` were ported into `apps/web`
(`src/components/ui/ImageWithFallback.tsx`, `src/components/ui/LoadingState.tsx`) with §32.7
re-theme, mounted at a dev-only, auth-excluded, prod-404 route
(`src/app/dev/component-preview/`). LocationDisplay/VoiceInput are **not** ported yet (blocked on
the Nominatim replacement + i18n), so run the ported subset:

```bash
BASE_URL=http://localhost:3001 COMPONENT_PREVIEW_URL=/dev/component-preview \
  npx playwright test component-port -g "ImageWithFallback|LoadingState" \
  --config tests/e2e/playwright.config.ts
# → 3 passed (chromium headless, apps/web on :3001)
```

Re-theme confirmed live: the spinner's coloured border computes to `rgb(37, 99, 235)` = `#2563eb`
= `--cos-blue`, not `--mobile-primary`.

**Regression the harness caught (real):** the mockup `ImageWithFallback` relied on the `<img>`
`onError` event, which under Next **SSR** fires before hydration attaches the handler → the
fallback never rendered (`complete=true, naturalWidth=0`, but no `didError`). The Vite mockup
(client-only) never hit this. Fixed in the port with a `useRef` + `useEffect` mount check
(`img.complete && img.naturalWidth === 0 → setDidError`). This is exactly the re-theme/SSR
regression class the web harness exists to catch.
