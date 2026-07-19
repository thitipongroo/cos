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
	"os"
	"os/signal"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/construction-os/iot-ingestion-worker/internal/ingest"
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

	kafka, err := kgo.NewClient(
		kgo.SeedBrokers(getEnv("KAFKA_BROKERS", "localhost:29092")),
		// Per-tenant topics are created lazily elsewhere; allow auto-create here so a device that
		// reports before the tenant's topic exists is not dropped.
		kgo.AllowAutoTopicCreation(),
	)
	if err != nil {
		log.Fatalf("kafka client: %v", err)
	}
	defer kafka.Close()

	onMessage := func(_ mqtt.Client, msg mqtt.Message) {
		topic, value, err := ingest.Transform(msg.Topic(), msg.Payload())
		if err != nil {
			log.Printf("drop telemetry from %s: %v", msg.Topic(), err)
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

	log.Println("iot-ingestion-worker started")
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("iot-ingestion-worker shutting down")
	cancel()
}
