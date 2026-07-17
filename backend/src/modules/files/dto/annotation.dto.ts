// Photo-annotation response shape (ADR-056).
//
// There is no request DTO here: writing an annotation goes through POST /sync/push, whose PushItemDto
// payload is opaque `Record<string, unknown>` for every entity (issue, safety, …). The sync switch
// reads `strokes` / `version` from the payload with safe defaults, exactly as the other entities do,
// and the stroke shape is intentionally not constrained — the server stores and returns it verbatim.

export interface AnnotationResponse {
  file_id: string;
  strokes: unknown;
  version: number;
  modified_by: string;
  modified_at: string;
}
