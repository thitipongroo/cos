# IoT Ingestion Worker (spec §33.3): EMQX (MQTT 5.0) → Kafka bridge.
# Same multi-stage layout as the other Go workers (analytics-worker, kg-ingestion-worker).
# No HTTP server — MQTT subscriber only — so no port is exposed.

FROM golang:1.26.5-alpine AS builder
WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o worker ./cmd/...

FROM alpine:3.19 AS runner
RUN addgroup -S cosgroup && adduser -S cosuser -G cosgroup
WORKDIR /app
COPY --from=builder /app/worker .
USER cosuser
CMD ["./worker"]
