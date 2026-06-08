import { createMetrics, injectKafkaTraceContext } from '@cos/tracing';
import type { Producer, Message, EachMessagePayload } from 'kafkajs';

const _metrics = createMetrics();

/**
 * Wraps a KafkaJS Producer.send() call to:
 * - Inject W3C trace context into message headers
 * - Increment kafka_messages_produced_total counter
 */
export function wrapProducer(producer: Producer): Producer {
  const originalSend = producer.send.bind(producer);

  producer.send = async (record) => {
    const messages: Message[] = (record.messages ?? []).map((msg) => ({
      ...msg,
      headers: injectKafkaTraceContext(
        (msg.headers as Record<string, string | Buffer | undefined>) ?? {},
      ),
    }));

    const result = await originalSend({ ...record, messages });

    const topic = record.topic;
    _metrics.kafkaProducedTotal.add(messages.length, { topic });

    return result;
  };

  return producer;
}

/**
 * Wraps a KafkaJS Consumer.run() callback to:
 * - Increment kafka_messages_consumed_total on each message
 * - Record processing latency as db_query_duration analogue
 */
export function wrapConsumerEachMessage(
  eachMessage: (payload: EachMessagePayload) => Promise<void>,
  consumerGroup: string,
): (payload: EachMessagePayload) => Promise<void> {
  return async (payload: EachMessagePayload) => {
    const { topic } = payload;
    await eachMessage(payload);
    _metrics.kafkaConsumedTotal.add(1, { topic, consumer_group: consumerGroup });
  };
}

/**
 * Register an observable gauge callback that reports consumer lag.
 * Call this from the Kafka consumer setup after connecting.
 * The callback will be invoked on each Prometheus scrape interval.
 */
export function registerConsumerLagGauge(
  fetch: () => Promise<Array<{ topic: string; group: string; lag: number }>>,
): void {
  _metrics.kafkaConsumerLag.addCallback(async (result) => {
    const entries = await fetch();
    for (const { topic, group, lag } of entries) {
      result.observe(lag, { topic, consumer_group: group });
    }
  });
}

/**
 * Register an observable gauge callback that reports DLQ depth.
 * Call this once from any Kafka consumer that processes DLQ topics.
 */
export function registerDlqDepthGauge(
  fetch: () => Promise<Array<{ topic: string; depth: number }>>,
): void {
  _metrics.kafkaDlqDepth.addCallback(async (result) => {
    const entries = await fetch();
    for (const { topic, depth } of entries) {
      result.observe(depth, { topic });
    }
  });
}
