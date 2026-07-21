package coskafka

import "encoding/json"

// EventEnvelope is the CloudEvents-shaped wrapper every COS Kafka message carries.
//
// Mirrors BaseEventEnvelope in @cos/shared: the producer builds exactly these fields and nests the
// domain data under payload. trace_id and span_id are Avro unions (["null","string"]) — they arrive
// wrapped as {"string": ...} and are normalised by unwrapUnions before this struct is populated,
// which is why plain *string works here.
type EventEnvelope struct {
	EventID       string          `json:"event_id"`
	EventType     string          `json:"event_type"`
	EventVersion  string          `json:"event_version"`
	TenantID      string          `json:"tenant_id"`
	ActorID       string          `json:"actor_id"`
	OccurredAt    string          `json:"occurred_at"`
	CorrelationID string          `json:"correlation_id"`
	TraceID       *string         `json:"trace_id"`
	SpanID        *string         `json:"span_id"`
	Payload       json.RawMessage `json:"payload"`
}
