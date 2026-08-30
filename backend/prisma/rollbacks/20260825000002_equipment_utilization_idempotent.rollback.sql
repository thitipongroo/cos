-- Rollback for 20260825000002_equipment_utilization_idempotent.
-- Dropping this index restores the append-on-replay behaviour: an offline-sync retry then adds a
-- second utilization row for the same equipment and instant, inflating summed hours and fuel.
DROP INDEX IF EXISTS equipment_telemetry.uq_equipment_utilization_natural_key;
