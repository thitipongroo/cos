// G2 exit benchmark (spec §17.10, option B) — measures the MIGRATED Drizzle/expo-sqlite code
// path on the real local_material_consumptions table and compares against the G1 spike envelope
// (recorded in §17.10). Reached via `cos:///e2e/benchmark?n=500` after login
// (e2e/benchmark.spec.ts). Results render on-screen for screenshot extraction.
//
// Envelope (G1 spike medians, iPhone 17 sim / Release Hermes):
//   n=500 : upsert 26.9 ms · query 5.8 ms (warm) / 12.4 ms (cold)
//   n=5000: upsert 280.0 ms · query 60.0 ms (warm) / 70.6 ms (cold)
// mode=seed / mode=cold reproduce the cold-read protocol from G1.

import { useEffect, useState } from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { eq } from 'drizzle-orm';
import { db, newLocalId } from '../../db/database';
import { localMaterialConsumptions as t } from '../../db/schema';

const MARKER = 'g2-bench-project';
const COLD_MARKER = 'g2-cold-project';
const DEFAULT_BATCH = 500;
const ITERATIONS = 3;
const INSERT_CHUNK = 2000; // SQLite 32,766 bind-param ceiling (8 cols → ≤4,095 rows/statement)

// G1 spike envelope medians (ms) — §17.10
const ENVELOPE: Record<number, { upsert: number; warmQuery: number; coldQuery: number }> = {
  500: { upsert: 26.9, warmQuery: 5.8, coldQuery: 12.4 },
  5000: { upsert: 280.0, warmQuery: 60.0, coldQuery: 70.6 },
};

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const fmt = (xs: number[]): string =>
  `[${xs.map((x) => x.toFixed(1)).join(', ')}] median ${median(xs).toFixed(1)}ms`;

function rows(batch: number, prefix: string) {
  return Array.from({ length: batch }, (_, i) => ({
    id: newLocalId(),
    consumptionId: `${prefix}-${i}`,
    projectId: prefix === 'cold' ? COLD_MARKER : MARKER,
    materialName: `Cement bag ${i}`,
    quantity: i + 1,
    unit: 'bag',
    consumedAt: '2026-07-04T00:00:00Z',
    offlineSyncStatus: 'SYNCED' as const,
  }));
}

async function insertChunked(values: ReturnType<typeof rows>): Promise<void> {
  await db.transaction(async (tx) => {
    for (let o = 0; o < values.length; o += INSERT_CHUNK) {
      await tx.insert(t).values(values.slice(o, o + INSERT_CHUNK));
    }
  });
}

async function benchG2(batch: number): Promise<string[]> {
  const upsert: number[] = [];
  const query: number[] = [];
  let count = 0;
  for (let iter = 0; iter < ITERATIONS; iter += 1) {
    await db.delete(t).where(eq(t.projectId, MARKER)); // untimed cleanup
    const values = rows(batch, `g2-${iter}`);
    const t0 = performance.now();
    await insertChunked(values);
    upsert.push(performance.now() - t0);
    const t1 = performance.now();
    const got = await db.select().from(t).where(eq(t.projectId, MARKER));
    query.push(performance.now() - t1);
    count = got.length;
  }
  await db.delete(t).where(eq(t.projectId, MARKER));

  const env = ENVELOPE[batch];
  const out = [
    `G2 upsert${batch}: ${fmt(upsert)}`,
    `G2 query${batch} : ${fmt(query)} (rows=${count})`,
  ];
  if (env) {
    out.push(
      `ENVELOPE upsert: ${(median(upsert) / env.upsert).toFixed(2)}x of G1 (${env.upsert}ms)`,
    );
    out.push(
      `ENVELOPE query : ${(median(query) / env.warmQuery).toFixed(2)}x of G1 (${env.warmQuery}ms)`,
    );
  }
  return out;
}

async function seed(batch: number): Promise<string[]> {
  await db.delete(t).where(eq(t.projectId, COLD_MARKER));
  await insertChunked(rows(batch, 'cold'));
  return [`SEED DONE (${batch} rows)`];
}

async function coldRead(batch: number): Promise<string[]> {
  const times: number[] = [];
  let count = 0;
  for (let i = 0; i < 3; i += 1) {
    const t0 = performance.now();
    const got = await db.select().from(t).where(eq(t.projectId, COLD_MARKER));
    times.push(performance.now() - t0);
    count = got.length;
  }
  const env = ENVELOPE[batch];
  const out = [
    `G2 COLD query: ${times[0]!.toFixed(1)}ms (rows=${count})`,
    `G2 WARM query: [${times
      .slice(1)
      .map((x) => x.toFixed(1))
      .join(', ')}]ms`,
  ];
  if (env)
    out.push(
      `ENVELOPE cold : ${(times[0]! / env.coldQuery).toFixed(2)}x of G1 (${env.coldQuery}ms)`,
    );
  return out;
}

export default function G2Benchmark() {
  const { mode, n } = useLocalSearchParams<{ mode?: string; n?: string }>();
  const batch = Math.max(1, parseInt(n ?? '', 10) || DEFAULT_BATCH);
  const [lines, setLines] = useState<string[]>(['G2 BENCHMARK RUNNING…']);

  useEffect(() => {
    (async () => {
      const out: string[] = [];
      try {
        if (mode === 'seed') out.push(...(await seed(batch)));
        else if (mode === 'cold') out.push(...(await coldRead(batch)));
        else out.push(...(await benchG2(batch)));
        out.push('G2 DONE');
      } catch (e) {
        out.push('G2 ERROR: ' + String(e));
      }
      setLines(out);
    })();
  }, [mode, batch]);

  return (
    <ScrollView testID="g2-benchmark" contentContainerStyle={styles.container}>
      {lines.map((l) => (
        <Text key={l} style={styles.line}>
          {l}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingTop: 80, paddingHorizontal: 12 },
  line: { fontFamily: 'Courier', fontSize: 13, marginBottom: 6, color: '#111' },
});
