# ADR-105: A profile photo gets a URL that does not expire, not a URL that is public

**Date:** 2026-09-13
**Status:** Accepted
**Deciders:** Product Owner (a permanent profile-photo endpoint in the File Service)
**Tags:** backend | file-service | mobile | security | privacy

---

## Context

`platform.users.photo_url` has existed since 2026-07-16. Its migration says what it is for:

> Stores the file-service URL rather than the image: uploads already go through
> `POST /api/v1/files/upload` (files.files), and duplicating blob storage on the identity table
> would put user photos outside the retention policies that own every other uploaded file.

That was the right shape and it was never finished. `PATCH /users/me/photo` was built, and nothing
ever called it: measured 2026-09-13, `updateMyPhoto` in `apps/mobile/src/api/users.ts` has no caller
anywhere in the app, no seed writes the column, and `apps/web` does not read it at all. The column is
NULL on every account in existence.

**The half that was missing is not the write — it is the URL.** The File Service issues exactly one
kind of URL for stored content: a MinIO presigned GET with a one-hour lifetime
(`SIGNED_URL_TTL_SECONDS`, default 3600 — `config.ts:74`, `minio.service.ts:64`), handed out by
`GET /api/v1/files/:fileId/url` and refused outright until ClamAV has cleared the file
(`files.routes.ts:177`). Storing one of those in the column gives an avatar that 403s an hour after
it is set, on every screen that draws one.

So the Stitch profile screen's `แก้ไขรูปภาพ` control could not be built as planned. The plan item
said "`PATCH /users/me/photo` already exists", which is true and settles the write; it does not
settle what to write.

## Decision

1. **`GET /api/v1/files/:fileId/image`** on the File Service — streams the stored bytes.
2. **Its authorisation is identical to `GET /:fileId/url`**: a verified bearer token (the service's
   `auth` plugin, which has no unauthenticated path but its two health probes), the caller's own
   tenant (`findFileById(fileId, tenantId)` → 404 otherwise), and `file_status === 'CLEAN'`.
   **Nothing is relaxed.**
3. **"Permanent" means the authorisation moved from the URL into the header.** A presigned URL
   carries its own credential and therefore has to expire. One that authenticates per request does
   not need to.
4. **Images only** (`mime_type` starts with `image/`), else `COS-FILE-020`.
5. **`Cache-Control: private, max-age=86400, immutable` and an ETag** from the `sha256` already
   stored on the row.
6. **The mobile client attaches the token** through one helper, `lib/fileImageSource.ts`, which adds
   the `Authorization` header only for URLs that point at this deployment's own API.

## Rationale

**Why not a public URL.** It is the obvious way to make an avatar "just work" in an `<img>`, and it
was rejected on two independent grounds, either of which is sufficient.

The first is this service's own threat model, written into `plugins/auth.ts` when the bearer token
was made mandatory: Kong is deployed nowhere, the Service is ClusterIP with no NetworkPolicy and no
mesh, so "an unauthenticated pod in the namespace could send `x-user-role: SYSTEM_ADMIN` with any
tenant it liked". The conclusion recorded there is that there is **no gateway behind which
unauthenticated access could be safe**. A public route would be the first exception to that, opened
for a convenience.

The second is what the bytes are. A profile photo is a face. The schema tags it
`@pdpa(category: "identity")` — "a profile photo identifies the person" — and QM-5 governs it. A
permanent unauthenticated URL is, by construction, a link that can be pasted, embedded, indexed and
forwarded; deleting the account would not un-share it. That is a data-protection decision, and it is
not one to make as a side effect of drawing an avatar.

**Why not store `file_id` and mint a signed URL per render.** It works, and it keeps every existing
guarantee, but it makes drawing an avatar a two-request operation on every screen that shows one, and
it puts a 1-hour bomb inside any component that caches the resolved URL. It also changes what the
column means — `photo_url` would hold something that is not a URL — which is a migration on a column
four screens already read.

**Why images only.** Without that clause this becomes a second general download path beside the
signed-URL route, free to drift from it. It also bounds the pod: `sizeLimitFor` caps an image at
20 MB where a DWG may be 200 MB, and this route streams rather than buffering
(`getObjectStream`, not `downloadToBuffer` — the latter exists to hand whole objects to ClamAV, which
needs them in memory, and reusing it here would put a copy of every concurrent download in the heap).

**Why `private` and `immutable` together.** `private` because the bytes belong to one tenant behind a
bearer token and a shared cache must not hand them to a second caller. `immutable` because
`buildStoredKey` mints a fresh uuid per upload, so a changed photo is a changed URL — the bytes
behind a given URL never change, which is exactly the condition that header asserts.

## Consequences

### Positive

- The column finally holds what its own migration said it would, and an avatar set today still
  renders tomorrow.
- No new authorisation surface: a reviewer comparing this route with `/:fileId/url` sees the same
  four checks in the same order.
- Avatars stop re-downloading. An ETag plus a day of `private` caching turns the second and later
  renders of the same face into a 304.

### Negative

- **A photo URL pasted into a browser will not render**, because the browser sends no bearer token.
  This surprises people, so it is written at the route and in the client helper as well as here.
- **Every client that draws a `photo_url` must attach the header.** In this repo that is
  `apps/mobile` alone (`apps/web` does not read the column), through one helper — but a future web
  avatar inherits the obligation, and will get a broken image rather than an error if it forgets.
- The helper decides whether to attach the token by comparing the URL's origin to
  `EXPO_PUBLIC_API_URL`. A deployment that serves the API from a different origin than the one the
  app is built against gets no header, and therefore a 401 — which is a misconfiguration, but one
  that shows up as a missing avatar rather than as a startup failure.
- One more route between a caller and stored bytes. It shares the CLEAN gate with the signed-URL
  route rather than re-deriving it, so the two cannot disagree about when a file may be served.

### Rollback

No migration, so nothing to roll back in the database. Removing the route makes every stored
`photo_url` 404, and avatars fall back to initials — which is the behaviour on a NULL column and is
already what every account does today. The client helper is inert on any URL that is not this
deployment's API.

## References

- ADR-054 — mobile-only device enrolment (why this platform's client story is React Native)
- ADR-085 — mockups are authoritative for style, not composition
- ADR-104 — the other half of the Stitch settings work, and the same "state the constraint" pattern
- `docs/api/error-codes.md` — `COS-FILE-020`, `COS-FILE-021`
- `docs/specifications/32-implementation-specifications.md` §32.7 "Profile"
- `backend/prisma/migrations/20260716000001_user_photo_url/migration.sql` — the original intent
- `.claude/rules/qm-05-data-privacy.md` — PII classification and PDPA obligations
