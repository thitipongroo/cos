FROM golang:1.26.4-alpine AS builder
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
EXPOSE 8090
CMD ["./worker"]
