-- Phase 14 — Analytics: ensure analytics database exists.
-- CLICKHOUSE_DB env var already creates it, but this guards against env var absence.
CREATE DATABASE IF NOT EXISTS analytics;
