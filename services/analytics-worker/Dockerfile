FROM golang:1.26.5-alpine AS builder
# Root build context. This service depends on the shared coslib module via a `replace`
# directive pointing outside its own directory, so a service-scoped context cannot see it
# (ADR-069). A published module tag would avoid this, but `go mod download` would then need
# network access at build time, which the air-gapped target (ADR-039) does not have.
WORKDIR /app
COPY libs/go ./libs/go
COPY services/analytics-worker/go.mod services/analytics-worker/go.sum* ./services/analytics-worker/
WORKDIR /app/services/analytics-worker
RUN go mod download
COPY services/analytics-worker ./
RUN CGO_ENABLED=0 GOOS=linux go build -o worker ./cmd/...

FROM alpine:3.19 AS runner
RUN addgroup -S cosgroup && adduser -S cosuser -G cosgroup
WORKDIR /app
COPY --from=builder /app/services/analytics-worker/worker .
USER cosuser
EXPOSE 8090
CMD ["./worker"]
