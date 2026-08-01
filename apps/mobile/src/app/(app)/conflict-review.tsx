// Conflict review — SITE_ENGINEER/PM manual resolution of sync conflicts (Phase 10; diff = G-M19).
// Lists GET /site/conflict-records (returns client_payload + server_payload) and resolves via
// PATCH /site/conflict-records/:id/resolve. Tap a record to see the client-vs-server field diff so the
// reviewer can decide before resolving. Reached from ConflictBadge (href:null in (app)/_layout).

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { get, mutate } from '../../api/client';
import { StatusChip } from '../../components/StatusChip';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

type Payload = Record<string, unknown> | null;

interface ConflictRecord {
  conflict_id: string;
  entity_type: string;
  conflict_type: string;
  client_payload?: Payload;
  server_payload?: Payload;
}

interface DiffRow {
  field: string;
  client: string;
  server: string;
}

function toText(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Union of keys across both payloads → per-field client vs server values.
function buildDiff(client: Payload, server: Payload): DiffRow[] {
  const keys = Array.from(new Set([...Object.keys(client ?? {}), ...Object.keys(server ?? {})]));
  return keys.map((field) => ({
    field,
    client: toText((client ?? {})[field]),
    server: toText((server ?? {})[field]),
  }));
}

export default function ConflictReviewScreen() {
  const [records, setRecords] = useState<ConflictRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  // Remote /site/conflict-records is pending on first paint — gate the list loader on it so the
  // empty-state text no longer flashes before rows arrive.
  const [loading, setLoading] = useState(true);
  const t = useT();

  const load = async (): Promise<void> => {
    try {
      const res = await get<{ items?: ConflictRecord[] } | ConflictRecord[]>(
        '/site/conflict-records',
      );
      setRecords(Array.isArray(res) ? res : (res.items ?? []));
    } catch {
      /* offline — keep cached */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const resolve = async (id: string): Promise<void> => {
    await mutate(
      'PATCH',
      `/site/conflict-records/${id}/resolve`,
      { resolution_note: 'resolved on device' },
      'conflict',
      id,
    );
    setRecords((prev) => prev.filter((r) => r.conflict_id !== id));
  };

  return (
    <View testID="conflict-review-screen" style={screen.container}>
      <LoadingBoundary loading={loading} variant="list" theme="light" style={styles.listRegion}>
        <FlatList
          data={records}
          keyExtractor={(r) => r.conflict_id}
          ListEmptyComponent={<Text style={screen.empty}>{t('sync.conflictReview.empty')}</Text>}
          renderItem={({ item }) => {
            const open = openId === item.conflict_id;
            const diff = open
              ? buildDiff(item.client_payload ?? null, item.server_payload ?? null)
              : [];
            return (
              <View testID="conflict-record-item" style={screen.item}>
                <TouchableOpacity
                  style={styles.itemHead}
                  onPress={() => setOpenId(open ? null : item.conflict_id)}
                >
                  <Text style={screen.itemTitle}>{item.entity_type}</Text>
                  <StatusChip label={item.conflict_type} />
                </TouchableOpacity>

                {open ? (
                  <View testID="conflict-diff" style={styles.diff}>
                    <View style={styles.diffRow}>
                      <Text style={[styles.diffCell, styles.diffHeadCell]}>
                        {t('sync.conflictReview.field')}
                      </Text>
                      <Text style={[styles.diffCell, styles.diffHeadCell]}>
                        {t('sync.conflictReview.client')}
                      </Text>
                      <Text style={[styles.diffCell, styles.diffHeadCell]}>
                        {t('sync.conflictReview.server')}
                      </Text>
                    </View>
                    {diff.map((d) => {
                      const differs = d.client !== d.server;
                      return (
                        <View key={d.field} style={styles.diffRow}>
                          <Text style={styles.diffCell}>{d.field}</Text>
                          <Text style={[styles.diffCell, differs && styles.diffChanged]}>
                            {d.client}
                          </Text>
                          <Text style={[styles.diffCell, differs && styles.diffChanged]}>
                            {d.server}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <TouchableOpacity
                  testID="resolve-conflict-button"
                  style={styles.resolve}
                  onPress={() => resolve(item.conflict_id)}
                >
                  <Text style={styles.resolveText}>{t('sync.conflictReview.resolve')}</Text>
                </TouchableOpacity>
              </View>
            );
          }}
        />
      </LoadingBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  // The conflict list fills the screen; the loader stands in for it while /site/conflict-records
  // is pending so the empty-state text no longer flashes first.
  listRegion: { flex: 1 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  diff: { gap: 2, marginVertical: spacing.xs },
  diffRow: { flexDirection: 'row', gap: spacing.xs },
  diffCell: {
    flex: 1,
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  diffHeadCell: { fontFamily: fontFamily.semibold, color: colors.textSecondary },
  diffChanged: { color: colors.danger, fontFamily: fontFamily.medium },
  resolve: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  resolveText: {
    color: colors.bg,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    textTransform: 'uppercase',
  },
});
