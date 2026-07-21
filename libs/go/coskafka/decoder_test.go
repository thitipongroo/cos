package coskafka

import (
	"encoding/json"
	"os"
	"testing"
)

// testdata/carbon.record.created.v1.bin was produced by the REAL TypeScript producer serializer
// (@kafkajs/confluent-schema-registry) against the committed .avsc, not by any Go code. It is the
// regression guard for the defect this package fixes: a consumer that json.Unmarshal's the raw
// value fails on these exact bytes, and no amount of mutually-mocked unit tests on either side
// would reveal it.
const goldenPath = "testdata/carbon.record.created.v1.bin"

func goldenBytes(t *testing.T) []byte {
	t.Helper()
	b, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("read golden fixture: %v", err)
	}
	return b
}

func TestGolden_IsConfluentFramed(t *testing.T) {
	b := goldenBytes(t)

	if b[0] != magicByte {
		t.Fatalf("byte 0 = 0x%02x, want magic byte 0x00", b[0])
	}
	id, err := SchemaIDFrom(b)
	if err != nil {
		t.Fatalf("SchemaIDFrom: %v", err)
	}
	if id < 1 {
		t.Errorf("schema id = %d, want a positive registry id", id)
	}
}

// The whole point, stated as a test: plain JSON parsing cannot read these bytes.
func TestGolden_PlainJSONUnmarshalFails(t *testing.T) {
	b := goldenBytes(t)

	var envelope map[string]any
	if err := json.Unmarshal(b, &envelope); err == nil {
		t.Fatal("json.Unmarshal succeeded on Confluent-framed Avro — " +
			"the fixture is no longer Avro-encoded, so this package's reason to exist has changed")
	}
}

func TestSchemaIDFrom(t *testing.T) {
	t.Run("rejects a value shorter than the header", func(t *testing.T) {
		if _, err := SchemaIDFrom([]byte{0x00, 0x00}); err == nil {
			t.Error("want an error for a 2-byte value")
		}
	})

	t.Run("rejects a wrong magic byte", func(t *testing.T) {
		// '{' — what a raw-JSON producer would send. Must be diagnosed, not silently decoded.
		if _, err := SchemaIDFrom([]byte{'{', 0x00, 0x00, 0x00, 0x01}); err == nil {
			t.Error("want an error when byte 0 is not 0x00")
		}
	})

	t.Run("reads a big-endian schema id", func(t *testing.T) {
		id, err := SchemaIDFrom([]byte{0x00, 0x00, 0x00, 0x01, 0x86, 0xff})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if id != 390 { // 0x00000186
			t.Errorf("schema id = %d, want 390 — big-endian decoding is wrong", id)
		}
	})
}

func TestUnwrapUnions(t *testing.T) {
	t.Run("collapses a union-wrapped scalar", func(t *testing.T) {
		in := map[string]any{"trace_id": map[string]any{"string": "abc"}}
		out := unwrapUnions(in).(map[string]any)
		if out["trace_id"] != "abc" {
			t.Errorf("trace_id = %#v, want \"abc\" — Avro union wrapper not removed", out["trace_id"])
		}
	})

	t.Run("leaves a null union as nil", func(t *testing.T) {
		in := map[string]any{"span_id": nil}
		out := unwrapUnions(in).(map[string]any)
		if out["span_id"] != nil {
			t.Errorf("span_id = %#v, want nil", out["span_id"])
		}
	})

	t.Run("does not collapse a real single-field object", func(t *testing.T) {
		in := map[string]any{"payload": map[string]any{"unit": "kg"}}
		out := unwrapUnions(in).(map[string]any)
		payload, ok := out["payload"].(map[string]any)
		if !ok {
			t.Fatalf("payload was collapsed away: %#v", out["payload"])
		}
		if payload["unit"] != "kg" {
			t.Errorf("payload.unit = %#v, want \"kg\"", payload["unit"])
		}
	})

	t.Run("recurses through arrays", func(t *testing.T) {
		in := []any{map[string]any{"string": "x"}, map[string]any{"string": "y"}}
		out := unwrapUnions(in).([]any)
		if out[0] != "x" || out[1] != "y" {
			t.Errorf("array unions not unwrapped: %#v", out)
		}
	})
}

func TestIsAvroTypeName(t *testing.T) {
	for _, name := range []string{"null", "boolean", "int", "long", "float", "double", "bytes", "string"} {
		if !isAvroTypeName(name) {
			t.Errorf("%q should be recognised as an Avro union branch label", name)
		}
	}
	for _, name := range []string{"payload", "trace_id", "unit", "GHGScope"} {
		if isAvroTypeName(name) {
			t.Errorf("%q is a field name, not a union branch label", name)
		}
	}
}
