import { context, propagation } from '@opentelemetry/api';
import type { Context, TextMapGetter, TextMapSetter } from '@opentelemetry/api';

type KafkaHeaders = Record<string, Buffer | string | undefined>;

const setter: TextMapSetter<KafkaHeaders> = {
  set(carrier, key, value) {
    carrier[key] = value;
  },
};

const getter: TextMapGetter<KafkaHeaders> = {
  get(carrier, key) {
    const val = carrier[key];
    if (val == null) return undefined;
    return Buffer.isBuffer(val) ? val.toString('utf8') : val;
  },
  keys(carrier) {
    return Object.keys(carrier);
  },
};

/**
 * Injects the active W3C TraceContext into Kafka message headers.
 * Call this in the Kafka producer before sending a message.
 *
 * @param headers - existing headers object (will not be mutated)
 * @returns new headers object with traceparent (and tracestate if set) added
 */
export function injectKafkaTraceContext(headers: KafkaHeaders = {}): KafkaHeaders {
  const out: KafkaHeaders = { ...headers };
  propagation.inject(context.active(), out, setter);
  return out;
}

/**
 * Extracts W3C TraceContext from Kafka message headers into an OTel Context.
 * Call this in the Kafka consumer before processing a message.
 *
 * @param headers - Kafka message headers
 * @returns OTel Context with the extracted trace context (use with context.with())
 */
export function extractKafkaTraceContext(headers: KafkaHeaders = {}): Context {
  return propagation.extract(context.active(), headers, getter);
}
