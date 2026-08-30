-- Make an equipment utilization row idempotent on replay (§17.4 offline sync).
--
-- `POST /sync/push` is a REPLAY channel: §17.2 has the device retry a queued mutation up to five
-- times before giving up, so the same payload arriving twice is designed behaviour, not an edge
-- case. Without a key, each replay appends another row and the equipment's operated hours and fuel
-- inflate — silently, because both columns are only ever summed.
--
-- The delivery push handler already guards this class of bug (recordDelivery is idempotent on the
-- client-generated delivery_id, "a double-applied replay can mark a PO fulfilled on goods that
-- arrived once"). A utilization row has no id of its own; its identity is the equipment and the
-- instant, which is exactly what a replayed payload repeats.
--
-- recorded_at is included because it is the hypertable partition column: TimescaleDB requires every
-- unique index to contain it. That is also why this is the natural key rather than an added id.
--
-- Backward compatible (QM-9): additive. Any duplicate rows already present are untouched — the
-- index is created only if it can be, and existing duplicates would make that fail loudly rather
-- than silently discarding history.

CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_utilization_natural_key
  ON equipment_telemetry.equipment_utilization (tenant_id, equipment_id, recorded_at);
