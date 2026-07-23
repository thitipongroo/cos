// coslib — code shared by every Go worker. One module, one package per concern.
//
// Deliberately a single module rather than one per package (ADR-021): each additional module costs
// four edits — its own go.mod, a `replace` line in every consumer, a Dockerfile COPY, and a
// go-tests matrix entry — and that cost is paid again for every package added. The trade-off is
// that a service using only `cosotel` still resolves `coskafka`'s dependencies into its go.sum.
// They are not linked into the binary; Go only compiles packages that are actually imported.
//
// coskafka was extracted from services/{analytics,kg-ingestion}-worker/internal/coskafka on
// 2026-07-21, where the two copies were byte-identical apart from four comment lines. cosotel came
// from the same two services' internal/otel, which differed only in a default service name.
//
// Consumed via a `replace` directive rather than a published tag so that `docker build` needs no
// network — the on-premise/air-gapped target (ADR-039) makes that a hard requirement.
module github.com/construction-os/coslib

go 1.26.5

require (
	github.com/prometheus/client_golang v1.24.0
	github.com/redis/go-redis/v9 v9.21.0
	github.com/riferrei/srclient v0.7.4
	github.com/twmb/franz-go v1.21.5
	go.opentelemetry.io/otel v1.44.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp v1.44.0
	go.opentelemetry.io/otel/exporters/prometheus v0.66.0
	go.opentelemetry.io/otel/sdk v1.44.0
	go.opentelemetry.io/otel/sdk/metric v1.44.0
	go.opentelemetry.io/otel/trace v1.44.0
)

require (
	github.com/beorn7/perks v1.0.1 // indirect
	github.com/cenkalti/backoff/v5 v5.0.3 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/go-logr/logr v1.4.3 // indirect
	github.com/go-logr/stdr v1.2.2 // indirect
	github.com/golang/snappy v1.0.0 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/grpc-ecosystem/grpc-gateway/v2 v2.29.0 // indirect
	github.com/klauspost/compress v1.19.0 // indirect
	github.com/linkedin/goavro/v2 v2.14.1 // indirect
	github.com/munnerz/goautoneg v0.0.0-20191010083416-a7dc8b61c822 // indirect
	github.com/pierrec/lz4/v4 v4.1.26 // indirect
	github.com/prometheus/client_model v0.6.2 // indirect
	github.com/prometheus/common v0.70.0 // indirect
	github.com/prometheus/otlptranslator v1.0.0 // indirect
	github.com/prometheus/procfs v0.21.1 // indirect
	github.com/santhosh-tekuri/jsonschema/v5 v5.0.0 // indirect
	github.com/twmb/franz-go/pkg/kmsg v1.13.1 // indirect
	go.opentelemetry.io/auto/sdk v1.2.1 // indirect
	go.opentelemetry.io/otel/exporters/otlp/otlptrace v1.44.0 // indirect
	go.opentelemetry.io/otel/metric v1.44.0 // indirect
	go.opentelemetry.io/proto/otlp v1.10.0 // indirect
	go.uber.org/atomic v1.11.0 // indirect
	golang.org/x/net v0.56.0 // indirect
	golang.org/x/sync v0.21.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.38.0 // indirect
	google.golang.org/genproto/googleapis/api v0.0.0-20260526163538-3dc84a4a5aaa // indirect
	google.golang.org/genproto/googleapis/rpc v0.0.0-20260526163538-3dc84a4a5aaa // indirect
	google.golang.org/grpc v1.81.1 // indirect
	google.golang.org/protobuf v1.36.11 // indirect
)
