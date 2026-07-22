// IoT Ingestion Worker (spec §33.3 write path): EMQX (MQTT 5.0) → Kafka.
//
// Subscribes to cos/v1/devices/+/telemetry on the MQTT broker, transforms each message into a
// per-tenant Kafka event (internal/ingest.Transform), and produces it for the Digital Twin Service.
//
// MOCK-VERIFIED ONLY: there is no EMQX broker in the stack and no physical device, so this wiring
// has never run end to end. The transform it drives is unit-tested; the MQTT subscribe and Kafka
// produce paths here are not.
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/construction-os/iot-ingestion-worker/internal/health"
	"github.com/construction-os/iot-ingestion-worker/internal/ingest"
	"github.com/construction-os/iot-ingestion-worker/internal/topics"
)

const telemetryTopicFilter = "cos/v1/devices/+/telemetry"

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// NO kgo.AllowAutoTopicCreation() here: `auto.create.topics.enable` is false on every real
	// broker and the platform requires producers to run with auto-creation disabled (context.md
	// "Provision Kafka topics explicitly"; Phase 8 exit criteria). The topic is instead created
	// explicitly on first publish by the ensurer below — the Go port of KafkaProducer.ensureTopic.
	kafka, err := kgo.NewClient(
		kgo.SeedBrokers(getEnv("KAFKA_BROKERS", "localhost:29092")),
	)
	if err != nil {
		log.Fatalf("kafka client: %v", err)
	}
	defer kafka.Close()

	ensurer := topics.NewEnsurer(topics.NewKadmCreator(kafka))

	onMessage := func(_ mqtt.Client, msg mqtt.Message) {
		topic, value, err := ingest.Transform(msg.Topic(), msg.Payload())
		if err != nil {
			log.Printf("drop telemetry from %s: %v", msg.Topic(), err)
			return
		}
		// Create the topic before publishing to it. Dropped (not retried) on failure so one
		// unreachable broker cannot block the MQTT callback for every other device; the produce
		// below would fail anyway without the topic.
		if err := ensurer.Ensure(ctx, topic); err != nil {
			log.Printf("drop telemetry for %s: ensure topic failed: %v", topic, err)
			return
		}
		kafka.Produce(ctx, &kgo.Record{Topic: topic, Value: value}, func(_ *kgo.Record, err error) {
			if err != nil {
				log.Printf("kafka produce to %s failed: %v", topic, err)
			}
		})
	}

	opts := mqtt.NewClientOptions().
		AddBroker(getEnv("MQTT_BROKER_URL", "tcp://localhost:1883")).
		SetClientID("iot-ingestion-worker").
		SetOnConnectHandler(func(c mqtt.Client) {
			if tok := c.Subscribe(telemetryTopicFilter, 1, onMessage); tok.Wait() && tok.Error() != nil {
				log.Printf("mqtt subscribe failed: %v", tok.Error())
			} else {
				log.Printf("subscribed to %s (QoS 1)", telemetryTopicFilter)
			}
		})

	client := mqtt.NewClient(opts)
	if tok := client.Connect(); tok.WaitTimeout(10*time.Second) && tok.Error() != nil {
		log.Fatalf("mqtt connect: %v", tok.Error())
	}
	defer client.Disconnect(250)

	// Liveness endpoint for the Kubernetes probe (the rest of this process is an MQTT loop with no
	// HTTP surface). Started last so the pod only reports live once MQTT is connected.
	port := health.Port()
	go func() {
		log.Printf("iot-ingestion-worker health listening on :%s", port)
		if err := http.ListenAndServe(":"+port, health.Handler("iot-ingestion-worker")); err != nil {
			log.Fatalf("http server: %v", err)
		}
	}()

	log.Println("iot-ingestion-worker started")
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("iot-ingestion-worker shutting down")
	cancel()
}
