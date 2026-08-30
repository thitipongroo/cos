// Notification event-type constants that callers OUTSIDE this module are expected to use.
//
// In `public/` rather than beside the service because a `const` can never appear in a NestJS
// `@Module({ exports: [...] })` — that list holds providers. Without a named public surface, the one
// way for tenant/ to name this gate was to reach into notification.service.ts, which is how it came
// to be recorded as a module-boundary breach in 2026-08-26. The string itself is the contract; the
// service is free to change around it.

/**
 * The §19.8 provisioning human gate. It is NOT a Kafka event — "sent directly by
 * EnterpriseProvisioningWorkflow via the Notification Service" — so it has no canonical event type,
 * no .avsc and no EVENT_ROLE_MAP entry. The string is still the templates table's key, which is how
 * its subject/body and its two channels come from data rather than from an INSERT literal.
 */
export const PLATFORM_HUMAN_GATE_EVENT_TYPE = 'platform.enterprise.awaiting_approval';
