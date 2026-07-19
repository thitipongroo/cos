# ADR-056: Photo annotation — engines, stroke model, and conflict strategy

**Date:** 2026-07-17
**Status:** Accepted
**Deciders:** Product owner
**Tags:** mobile | architecture | data

---

## Context

§32.7 has always specified `<PhotoCapture />` as "Camera + gallery grid, inline annotation, offline
queue". The shipped `apps/mobile/src/components/PhotoCapture.tsx` has the camera and the offline
queue and neither the gallery grid nor any annotation. `apps/web` has no photo component at all.

The mockup `PhotoAnnotation` is built entirely on browser Canvas 2D: `getImageData`/`putImageData`
for undo, `toBlob` to save, `drawImage`/`fillText` to render. React Native has none of these, so
"port it" was never an option — the component had to be redesigned, which required decisions.

Two rounds of multi-source research preceded this ADR. The first ran on a **wrong premise** (Expo SDK
51, read from stale comments in `pnpm-workspace.yaml`); the app is actually on **SDK 56 / RN 0.85.3 /
React 19.2.3**, which dissolves that round's headline blocker (Skia 2.x needs RN ≥ 0.79 / React ≥ 19).
Both rounds failed to find any evidence of which libraries real organisations use for image
annotation specifically, and failed entirely on mobile image memory and Skia path serialization. Those
two gaps were closed by an on-device spike instead — the measurements below are ours, not citations.

## Decision

1. **Mobile only.** Photo markup is a field task done on the phone. A web annotator was scoped
   (Konva) and then dropped — see Rationale.
2. **Mobile engine: `@shopify/react-native-skia`.** RN ≥ 0.79 / React ≥ 19 is satisfied. Expo pins
   the version per SDK — `npx expo install` on SDK 56 resolves **2.6.2**, not the latest 2.9.x.
3. **The photo is drawn INSIDE the annotation canvas**, not under a transparent overlay.
4. **Undo is a retained-mode stroke list**, not pixel snapshots.
5. **The stroke list is persisted and stays re-editable**; the flattened image is an export artifact.
6. **Strokes persist in normalised (0..1) coordinates.**
7. **Edit on a downscaled copy (long edge 2048); export at full resolution.**
8. **EXIF orientation is normalised defensively**, tolerating both SDK 56 and SDK 57 behaviour.
9. **Annotations are editable at any time, including after sync.**
10. **Conflict strategy: `CONFLICT_FLAGGED`** — no auto-resolution (§17.5).
11. **Server storage: a new `files.photo_annotations` table** carrying `version` + `modified_at`.
12. **The `<PhotoAnnotation />` toolbar owns its own i18n labels** under the `site` domain
    (`site.photo.annotate.*`), rather than taking them from the caller as `<LoadingState />` does.
13. **A dependent annotation is enqueued only after its photo has a server file id.** An annotation is
    addressed by the server `file_id`, which is `NULL` until the photo binary uploads. The client stores
    the strokes locally (`local_photo_annotations`, `dirty=1`) the instant they are saved, and defers the
    `/sync/push` (`entity_type="photo_annotation"`) until `PhotoUploadQueue.markUploaded` yields the
    `file_id` — a blocking upload-then-reference (two-phase) sequence, not a client-generated parent id
    or an id-remap table. This matches the §17.6 rule that media flushes last, and needs no dependency
    graph because there is exactly one edge (annotation → its photo).

## Rationale

**Why Skia, and on what evidence.** The honest basis is capability, licence, and maintenance — _not_
production precedent, because no such evidence was found for any candidate. Verified: v2.9.0 shipped
2026-07-16, MIT, `archived=false`, 3,879 commits, active prerelease; included in Expo Go with no
config plugin or prebuild; first-party export via `makeImageSnapshot` + `encodeToBytes`, so no second
capture library is needed. The alternative (`react-native-svg` + `react-native-view-shot`) loses on
concrete grounds: view-shot writes only to a **tmpfile that is deleted when the app closes** — a
latent data-loss bug for an offline queue that must survive restarts — it fails by returning a
**blank image rather than throwing** (the worst shape for a queue that would upload the blank), it is
not in Expo Go, and its Fabric support is unverified while SDK 56 is Fabric-only with no opt-out.

Skia's cost is real and must be quoted honestly: **+6 MB iOS / +4 MB Android**, where the Android
figure holds **only under App Bundle per-architecture download** — a universal release APK is
+41.3 MB. No `react-native-svg` size baseline exists, so this is not a like-for-like comparison.

**Why mobile only, and why the web engine was dropped.** The web annotator was scoped first — Konva +
react-konva (MIT, actively maintained, retained-mode, exports to image), chosen by elimination after
`tldraw` was disqualified on licence (below) and Fabric.js 7's centred-origin breaking change
threatened persisted coordinates. It was then dropped: a research pass across Procore, SiteCam,
Fieldwire and Bluebeam found photo markup to be a **predominantly mobile** feature (Procore's
verifiable markup tutorials and SiteCam's freehand markup are iOS; a Fieldwire "mobile + web photo
markup" claim did not survive verification; no vendor's web _photo_ annotation could be confirmed as
a norm — Bluebeam's web markup is PDFs, not photos). Building a second engine for a surface the
industry does not clearly staff was not justified. If web annotation is revisited, Konva is the
recorded starting point and `tldraw` stays prohibited.

**Why tldraw is prohibited.** Not a preference — a licence bar. `LICENSE.md` on main permits "Use the
Software in Development Environments" and obliges "Not to use the Software in Production
Environments", with production allowed only "under the terms of a separate commercial agreement".
The free hobby key forces a "made with tldraw" watermark.

**Why the photo goes inside the canvas.** `makeImageSnapshot()` captures Skia content only. A
transparent Skia overlay above an RN `<Image>` exports strokes on a blank background — so it would
need `react-native-view-shot` and `collapsable={false}`, and the flattening trap it guards against
got _worse_ when Fabric extended view flattening to iOS. Drawing the photo as a Skia `<Image>` in the
same canvas removes the whole class of failure. This is architecture, not detail.

**Why retained-mode undo.** Forced by the engine: Skia has no `getImageData`/`putImageData`, so the
mockup's pixel-snapshot undo cannot be ported at all and must be rebuilt as a stroke list. tldraw's
diff+mark history is the reference shape, with the caveat that tldraw is a vector store that never had
a raster buffer to snapshot — it supports this by analogy, not proof.

**Why the toolbar owns its i18n labels (unlike `<LoadingState />`).** ADR-055 had `<LoadingState />`
take its copy from the caller because a loading label is context ("Refining results…"). An annotation
toolbar is the opposite: its labels (pen, arrow, text, undo, save) are fixed chrome that mean the
same thing wherever the component appears. Verified i18n guidance (react-i18next `useTranslation`,
Lingui's shared-instance pattern) is that a reusable component binds to the app's i18n instance for
its own fixed strings rather than receiving them as props — and the claim that no settled convention
exists was refuted. Keys live under the existing `site` domain: `site.photo.annotate.*`.

**Why normalised coordinates + downscaled editing.** This was a proposal, so it was tested rather
than assumed (see Spike). It lets one stroke list render correctly at 2048×1536 while editing and at
4000×3000 on export, and it keeps annotations re-editable rather than burning them into pixels. The
offline queue requires a **file on disk** — it does not require discarding the strokes.

**Why `CONFLICT_FLAGGED`.** §17.5's `photos: union (additive, no conflict possible)` was true only
because a photo was immutable: a file plus an upload status, with nothing to edit. Making annotations
re-editable breaks that premise — two people can now mark up the same photo offline. Merging strokes
would silently blend two readings of one defect; last-write-wins would silently discard one. Neither
is acceptable for a record used to evidence site defects, so annotations take the same no-auto-resolve
treatment QM-9 already gives financial entities. The `union` rule itself stays correct and was
_scoped_ rather than replaced: it resolves which photos are attached, not their contents.

**Why a new table over `files.file_metadata`.** `CONFLICT_FLAGGED` requires detecting concurrent
modification, which needs a version or `modified_at`. `file_metadata` is a key/value table
(`metadata_key`/`metadata_value`) with neither. Bolting columns onto a KV table to serve one consumer
is worse than a purpose-shaped table.

## Spike results (measured on-device, not cited)

Android emulator, Android 17, x86_64, 3.8 GB RAM, emulated GPU. **This is not a real mid-range ARM
device**: RAM is comparable, but the GPU stack and the low-memory killer are not. Treat the memory
figures as indicative, not as a device certification.

| Question                                | Result                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| 12MP decode cost                        | **45.8 MB** per image (4000×3000 RGBA8888); 2048×1536 edit copy is **12.0 MB**             |
| 6 images held at once                   | peak **~360 MB** native heap; no OOM                                                       |
| Does `dispose()` reclaim?               | **Yes.** A second identical round (another 275 MB decoded) added **~5 MB**, not 275 MB     |
| Does native heap shrink after dispose?  | **No** — allocator retains pages. Expected; not a leak (the round-2 result proves reuse)   |
| Full-resolution export                  | `Surface.Make(4000,3000)` + `makeImageSnapshot()` + `encodeToBytes(JPEG, 90)` → **882 KB** |
| `toSVGString()` → `MakeFromSVGString()` | **Stable**: `svg1 === svg2 === svg3`, bounds delta **0**, verb count identical             |
| Path round-trip precision               | One-time quantisation of **7.6 × 10⁻⁶ px** on first save, then zero drift forever          |

The path round-trip ran against `canvaskit-wasm` (the same Skia core compiled to WASM). That build
ships a trimmed encoder set — **JPEG and WEBP return null there, while the native RN build encodes
JPEG fine** — a concrete reminder not to generalise wasm results to native.

**Not verified, and not to be claimed:** stroke alignment was computed, not observed — the arithmetic
is exact for the 4:3 case tested (4000×3000 → 2048×1536 has no letterbox), but other aspect ratios may
round at sub-pixel scale.

## Consequences

### Positive

- `<PhotoCapture />` can finally meet the "inline annotation" §32.7 has specified since the start.
- One conflict rule (`CONFLICT_FLAGGED`) reuses a strategy QM-9 already defines; nothing invented.
- Annotations stay editable and re-renderable at any resolution, rather than being burnt into pixels.
- `dispose()` is proven effective, so the memory ceiling is a design choice (downscale) not a leak.

### Negative

- +6 MB iOS / +4 MB Android app size, for a feature not every role uses.
- Web users cannot annotate photos. If that turns out to be needed, a second engine (Konva) and a
  second implementation of the same behaviour must be built later.
- `CONFLICT_FLAGGED` needs a resolution UI and a human in the loop — the most expensive option offered.
- A new table, migration, rollback, RLS policy, and sync endpoint before the first stroke ships.
- Peak ~465 MB through the export pipeline is close enough to a mid-range budget that a real device
  must be tested before release.
- **Accepted orphan-annotation window (evidence gap, PO-accepted).** Because the annotation push is
  deferred until the photo uploads, an annotation drawn on a photo that _never_ uploads (upload
  permanently `FAILED`, or the record is deleted before its media flushes) stays local forever and is
  never evidenced server-side. The deep-research round found no framework that closes this window
  without a client-generated parent id (which the server file model does not offer); blocking-until-parent
  is the documented pattern and it inherently carries this tail risk. We accept it: the strokes remain on
  the device and re-editable, and no dangling server reference is created (the push is what carries the
  strokes, so no push ⇒ no server row to dangle). Revisit only if field data shows annotations stranded
  behind stuck uploads.

### Neutral

- `PhotoAnnotation` → `apps/mobile/src/components/PhotoAnnotation.tsx`
  (redesigned on Skia, not a line-for-line port — see Context), and `AdvancedPhotoCapture`'s gallery
  grid, delete affordance, and annotation entry point → `apps/mobile/src/components/PhotoCapture.tsx`.
  The four web components the same mockup fed (`ImageWithFallback`, `LoadingState`, `LocationDisplay`,
  `VoiceInput`) are in `apps/web/src/components/`; `MobileInput`/`NumberPicker`/`IconPicker` were
  cancelled outright (`context/00_master_construction_os.md`, reconciliation note). `figma/` was
  therefore deleted — it is not in the pnpm workspace, CI, tsconfig, or Makefile, and its 101 files
  remain retrievable from git history (added in `040058f`, `03adfb6`).
  One deliberate divergence: the mockup deletes any photo unconditionally, but the shipped component
  offers delete only for photos that never reached the server, because `DELETE /files/{file_id}` is
  Tenant Admin only (spec §14) and `SyncOperation` has no `DELETE`. See `src/lib/photoGallery.ts`.
- Expo pins Skia per SDK (2.6.2 on SDK 56), so the version moves on SDK upgrades, not on demand.

## Notes for implementers

- **Build requires JDK 21.** RN's gradle plugin rejects JDK 25 (`Error resolving plugin
[com.facebook.react.settings] > 25.0.3`). Android Studio's bundled JBR is 21.0.10 and works.
- `SkData` is `SkJSIInstance<'Data'>` — it has `dispose()` and no `size()`.
- `Skia.Data.fromURI` on a path the app cannot read (e.g. `/data/local/tmp`, owned by the shell uid)
  **hangs rather than rejecting**. Use the app's own storage.

## References

- [32-implementation-specifications §32.7](../../specifications/32-implementation-specifications.md) —
  the `<PhotoAnnotation />` contract
- [17-offline-mobile-sync §17.5](../../specifications/17-offline-mobile-sync.md) —
  conflict rules per entity
- [ADR-055](055-universal-loading-component.md) — same per-platform component pattern
