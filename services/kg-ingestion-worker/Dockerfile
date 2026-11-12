FROM golang:1.26.10-alpine AS builder
# Root build context. This service depends on the shared coslib module via a `replace`
# directive pointing outside its own directory, so a service-scoped context cannot see it
# (ADR-069). A published module tag would avoid this, but `go mod download` would then need
# network access at build time, which the air-gapped target (ADR-039) does not have.
WORKDIR /app
COPY libs/go ./libs/go
COPY services/kg-ingestion-worker/go.mod services/kg-ingestion-worker/go.sum* ./services/kg-ingestion-worker/
WORKDIR /app/services/kg-ingestion-worker
RUN go mod download
COPY services/kg-ingestion-worker ./
RUN CGO_ENABLED=0 GOOS=linux go build -o worker ./cmd/...

# alpine:3.24, not 3.19: 3.19 is past end of support and its musl failed CI's Trivy image scan
# (HIGH, CVE-2026-40200); 3.22–3.24 scan clean (2026-11-12, D43).
FROM alpine:3.24 AS runner
RUN addgroup -S cosgroup && adduser -S cosuser -G cosgroup
WORKDIR /app
COPY --from=builder /app/services/kg-ingestion-worker/worker .
USER cosuser
EXPOSE 8090
CMD ["./worker"]
