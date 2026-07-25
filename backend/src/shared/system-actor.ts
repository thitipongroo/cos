// The platform "system" actor — a fixed UUID used as created_by / actor for rows that no human
// authored (e.g. AI-suggested project risks, ADR-065 source=AI_SUGGESTED). This keeps the audit
// invariant "every table has a non-null created_by" (file 01 §D) intact for machine-created rows,
// while `source = AI_SUGGESTED` (or an equivalent flag) marks them as non-human for triage.
//
// The nil UUID is the conventional "no specific entity" sentinel and cannot collide with a real
// gen_random_uuid() user id.
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';
