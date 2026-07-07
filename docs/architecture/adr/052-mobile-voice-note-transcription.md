# 052: Mobile voice-note capture (expo-audio) → File Service → AI transcription

**Date:** 2026-07-07
**Status:** Accepted
**Deciders:** Product owner (thitipongroo), engineering
**Tags:** mobile, ai

---

## Context

MVP AI scope (spec 20 §20.3 Layer A; §32.7 `<VoiceNoteButton />`) requires **voice transcription for
field notes** — a hold-to-record control that transcribes speech into a text field (e.g. the daily
report summary). The functional audit (2026-07-07, gap G-M7) found:

- The transcription backend **exists**: `POST /api/v1/ai/transcribe { file_id, tenant_id, language }`
  → `{ transcript }` (ai-gateway → ai-transcription-pipeline / Whisper). It reads the audio from the
  File Service by `file_id`.
- The mobile app had **no audio-recording dependency** and no `VoiceNoteButton`.
- The **File Service rejected audio uploads** — `ALLOWED_MIME_TYPES` covered image/pdf/CAD/spreadsheet/
  zip/video but **no audio type** — so there was no way to get a `file_id` for an audio file.

## Decision

1. **File Service**: add audio MIME types (`audio/mp4`, `audio/x-m4a`, `audio/aac`, `audio/mpeg`,
   `audio/wav`, `audio/webm`) to `ALLOWED_MIME_TYPES` with a 25 MB size cap (voice notes are short).
   Category derivation falls back to `other` — no new file category or DB migration.
2. **Mobile**: add **`expo-audio`** (SDK-56 bundled version `~56.0.12`, from
   `expo/bundledNativeModules.json`) and a `VoiceNoteButton` component: hold to record → upload the
   recording to `POST /api/v1/files/upload` (multipart, reusing the PhotoUploadQueue upload path) →
   `POST /api/v1/ai/transcribe` with the returned `file_id` → return the `transcript` to the caller.
   A 503 from the gateway (transcription provider not configured — Phase 11 stub) surfaces as an honest
   "unavailable" state, not an error dump.
3. Wire `VoiceNoteButton` into the daily-report screen: the transcript is appended to the summary field.

## Rationale

- `expo-audio` is the first-party SDK-56 recording module (`expo-av` is removed in this SDK); version is
  pinned from `bundledNativeModules.json`, not guessed.
- Reusing the existing File Service upload + signed-url path keeps the audio in the same storage/AV-scan
  pipeline the transcription service already reads from — no new storage path.
- Adding audio to the MIME allowlist is required for the (already-built) transcription endpoint to be
  reachable end-to-end; mapping to the existing `other` category avoids a schema change.

Alternatives rejected: `expo-av` (removed in SDK 56); a separate audio-only upload endpoint (duplicates
the File Service pipeline); base64 audio in the transcribe request (the endpoint takes a `file_id`, not
inline audio).

## Consequences

### Positive

- End-to-end voice note → transcript works; satisfies the §20.3 MVP Layer-A voice-transcription scope.
- Audio files flow through the same AV scan + retention pipeline as other uploads.

### Negative

- One additional Expo native module (`expo-audio`) — requires a dev-client / EAS rebuild + microphone
  permission (`NSMicrophoneUsageDescription` / `RECORD_AUDIO`).

### Neutral

- Audio files are categorised as `other` for retention until a dedicated `audio` category is warranted.

## References

- Spec 20 §20.3 (MVP AI Layer A — voice transcription); §32.7 (`<VoiceNoteButton />`)
- `services/ai-gateway/main.py` (`POST /api/v1/ai/transcribe`), `services/ai-transcription-pipeline`
- `services/file-service/src/middleware/validation.ts` (`ALLOWED_MIME_TYPES`)
- ADR-046 (Expo 56), ADR-051 (expo-crypto), gap G-M7
