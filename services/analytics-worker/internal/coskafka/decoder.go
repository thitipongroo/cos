// Confluent wire-format Avro decoding for Go consumers.
//
// The TypeScript producer (@cos/shared KafkaProducer) Avro-encodes every message through Confluent
// Schema Registry. Consumers that call json.Unmarshal on the raw value fail on byte 0 of every
// message — that defect is what this package exists to prevent recurring.
//
// Wire format (Confluent, documented in the Schema Registry serdes guide):
//
//	byte 0      magic byte, always 0x00
//	bytes 1..4  schema ID, int32 big-endian
//	bytes 5..   Avro binary payload
//
// NOTE: Confluent Platform 8.1.1 introduced an opt-in variant carrying a 16-byte schema GUID in a
// Kafka header instead of the 4-byte payload prefix. @kafkajs/confluent-schema-registry does not
// emit that variant, so the prefix form above is correct for this codebase. If the producer ever
// opts in, magicByte validation below is the thing that will start rejecting messages.
package coskafka

import (
	"encoding/binary"
	"encoding/json"
	"fmt"

	"github.com/riferrei/srclient"
)

const (
	magicByte    = 0x00
	headerLength = 5 // magic byte + 4-byte schema ID
)

// Decoder turns Confluent-framed Avro bytes into a Go value.
//
// Schema lookups are cached by srclient, so the registry is contacted once per unseen schema ID
// rather than once per message.
type Decoder struct {
	client *srclient.SchemaRegistryClient
}

// NewDecoder builds a Decoder against a Schema Registry URL (e.g. http://localhost:8081).
func NewDecoder(registryURL string) *Decoder {
	client := srclient.CreateSchemaRegistryClient(registryURL)
	client.CachingEnabled(true)
	client.CodecCreationEnabled(true)
	return &Decoder{client: client}
}

// SchemaIDFrom extracts the schema ID from a Confluent-framed message value.
//
// Separate from Decode so the framing check is unit-testable without a registry.
func SchemaIDFrom(value []byte) (int, error) {
	if len(value) < headerLength {
		return 0, fmt.Errorf(
			"message is %d bytes, too short for the %d-byte Confluent header — is the producer sending raw JSON?",
			len(value), headerLength)
	}
	if value[0] != magicByte {
		return 0, fmt.Errorf(
			"first byte is 0x%02x, expected magic byte 0x00 — value is not Confluent-framed Avro", value[0])
	}
	return int(binary.BigEndian.Uint32(value[1:headerLength])), nil
}

// Decode resolves the embedded schema, decodes the Avro body, and unmarshals it into out.
//
// The Avro→Go hop goes through Avro JSON rather than mapping natives directly: goavro returns
// map[string]interface{}, and re-marshalling by hand would duplicate every struct definition. The
// cost is that Avro JSON encodes unions as {"type": value}, which unwrapUnions below normalises
// before the final json.Unmarshal.
func (d *Decoder) Decode(value []byte, out any) error {
	schemaID, err := SchemaIDFrom(value)
	if err != nil {
		return err
	}

	schema, err := d.client.GetSchema(schemaID)
	if err != nil {
		return fmt.Errorf("resolve schema id %d from registry: %w", schemaID, err)
	}
	codec := schema.Codec()
	if codec == nil {
		return fmt.Errorf("schema id %d has no Avro codec (schema type is %v)", schemaID, schema.SchemaType())
	}

	native, _, err := codec.NativeFromBinary(value[headerLength:])
	if err != nil {
		return fmt.Errorf("decode avro body against schema id %d: %w", schemaID, err)
	}

	textual, err := codec.TextualFromNative(nil, native)
	if err != nil {
		return fmt.Errorf("render avro native to json: %w", err)
	}

	var generic any
	if err := json.Unmarshal(textual, &generic); err != nil {
		return fmt.Errorf("parse avro json: %w", err)
	}

	normalised, err := json.Marshal(unwrapUnions(generic))
	if err != nil {
		return fmt.Errorf("re-encode normalised json: %w", err)
	}
	if err := json.Unmarshal(normalised, out); err != nil {
		return fmt.Errorf("unmarshal into %T: %w", out, err)
	}
	return nil
}

// unwrapUnions rewrites Avro JSON union encoding into plain JSON.
//
// Avro renders a nullable field as {"string": "abc"} (or null), not "abc". A Go struct field of
// type *string or string cannot receive the wrapped form, so every single-key object whose key is
// an Avro type name is collapsed to its value. The envelope's trace_id and span_id are exactly this
// shape (["null","string"] with default null), which is why this is not a hypothetical case.
func unwrapUnions(v any) any {
	switch typed := v.(type) {
	case map[string]any:
		if len(typed) == 1 {
			for key, inner := range typed {
				if isAvroTypeName(key) {
					return unwrapUnions(inner)
				}
			}
		}
		out := make(map[string]any, len(typed))
		for key, inner := range typed {
			out[key] = unwrapUnions(inner)
		}
		return out
	case []any:
		out := make([]any, len(typed))
		for i, inner := range typed {
			out[i] = unwrapUnions(inner)
		}
		return out
	default:
		return v
	}
}

// isAvroTypeName reports whether a single map key is an Avro union branch label rather than a real
// field name. Only the primitive names are treated as union markers: named types (records, enums,
// fixed) are fully-qualified in Avro JSON output, so a bare field name can never collide with them,
// while a record that genuinely has one field called e.g. "string" would be misread — accepted,
// because no schema in packages/@cos/shared/src/avro uses a primitive type name as a field name.
func isAvroTypeName(key string) bool {
	switch key {
	case "null", "boolean", "int", "long", "float", "double", "bytes", "string":
		return true
	}
	return false
}
