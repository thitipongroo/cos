// Photo-annotation DTOs (ADR-056). Validated with class-validator (QM-4 — never hand-written checks).

import { IsArray, IsInt, Min } from 'class-validator';

/**
 * The body of a `photo_annotation` sync push. `strokes` is the retained-mode stroke list in
 * normalised (0..1) coordinates; `version` is the base version the client read, which drives the
 * `CONFLICT_FLAGGED` check. Stroke shape is intentionally not constrained here — it is opaque to the
 * server, which stores and returns it verbatim.
 */
export class PushAnnotationDto {
  @IsArray()
  strokes!: unknown[];

  @IsInt()
  @Min(0)
  version!: number;
}

export interface AnnotationResponse {
  file_id: string;
  strokes: unknown;
  version: number;
  modified_by: string;
  modified_at: string;
}
