// Reports screen — role-aware (G-M2).
//   EXECUTIVE      : AI-generated executive summary per project (master 3099/3203; §20.7.1) —
//                    POST /ai/reports/executive-summary via the ai-gateway (503 when the LLM is the
//                    Phase 11 stub → surfaced as "unavailable"). Online-only (uses non-queuing post()).
//   SITE_ENGINEER  : review submitted site reports + record material consumption (master 3197-3198).
// The bottom-nav "reports" tab is shared by both roles (see (app)/_layout.tsx); this switch renders
// the correct screen per JWT role.

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import axios from 'axios';
import { useRouter } from 'expo-router';
import { CosRole } from '@cos/types';
import { get, post } from '../../api/client';
import { enqueue } from '../../db/sync-queue';
import { decodeJwtPayload } from '../../lib/jwt';
import { useAuthStore } from '../../store/authStore';
import { StatusChip } from '../../components/StatusChip';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { ConflictBadge } from '../../components/ConflictBadge';
import { ProjectPicker } from '../../components/ProjectPicker';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { useI18n } from '../../i18n';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface ReportRow {
  report_id: string;
  report_date: string;
  status: string;
  summary?: string | null;
}

// ── SITE_ENGINEER — review reports + record material consumption ──────────────
function SiteEngineerReports() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [matName, setMatName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  const [savedFor, setSavedFor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const { t, formatDate } = useI18n();

  /**
   * `GET /site/reports` is page/limit paginated server-side (site-ops.controller: page ≥ 1, limit
   * capped at 100, default 20). The screen asked for page 1 and stopped, so the list was silently
   * the newest 20 reports with no way to reach the rest — which is what the drawing's "Load More
   * History" button is for (mockup 03_site_engineer/04_reports/04_se_reports).
   *
   * THERE IS NO TOTAL IN THE RESPONSE, so "is there more" is inferred the only honest way available:
   * a full page came back, so another page may exist. A short page means the end. That can cost one
   * empty request when the count divides exactly by the page size, which is cheaper than inventing a
   * `total` field the endpoint does not return.
   */
  const PAGE_SIZE = 20;

  const load = async (nextPage = 1): Promise<void> => {
    setLoading(true);
    try {
      const res = await get<{ items?: ReportRow[] } | ReportRow[]>(
        `/site/reports?page=${String(nextPage)}&limit=${String(PAGE_SIZE)}`,
      );
      const rows = Array.isArray(res) ? res : (res.items ?? []);
      // Page 1 REPLACES (it is also what pull-to-refresh calls); later pages append.
      setReports((prev) => (nextPage === 1 ? rows : [...prev, ...rows]));
      setPage(nextPage);
      setHasMore(rows.length === PAGE_SIZE);
    } catch {
      // offline / error — keep the last list
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // First load only: the list is still empty AND a fetch is in flight. Pull-refresh keeps the
  // RefreshControl (reports already populated → boundary stays settled), so a refresh never blanks
  // the list back to a skeleton.
  const firstLoad = loading && reports.length === 0;

  const canRecord = matName.trim() !== '' && qty.trim() !== '' && unit.trim() !== '';

  const recordMaterial = (reportId: string): void => {
    enqueue('material', reportId, 'CREATE', {
      report_id: reportId,
      material_name: matName.trim(),
      quantity: qty.trim(),
      unit: unit.trim(),
      consumed_at: new Date().toISOString(),
    });
    setSavedFor(reportId);
    setMatName('');
    setQty('');
    setUnit('');
  };

  return (
    <View testID="reports-screen" style={screen.container}>
      {/* The Active Project bar the mockups open every working screen with — added here 2026-08-12
          when it became the project standard (PO decision). `03_site_engineer/04_reports/
          04_se_reports` draws it above the search row, and this list was the one screen carrying
          the drawing that still had no way to see or change the project it was listing for. It
          renders nothing when no project is selected, so no role gains an empty strip. */}
      <ProjectContextBar />
      <View style={styles.headerRow}>
        <ConflictBadge onPress={() => router.push('/conflict-review')} />
      </View>
      <LoadingBoundary loading={firstLoad} variant="list" theme="light" style={styles.listRegion}>
        <FlatList
          testID="reports-list"
          data={reports}
          keyExtractor={(r) => r.report_id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load(1)} />}
          ListEmptyComponent={<Text style={screen.empty}>{t('site.reports.empty')}</Text>}
          // The drawing's "Load More History". Rendered only while a full page came back, so the
          // button never offers a page that is known not to exist.
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                testID="reports-load-more"
                accessibilityRole="button"
                accessibilityLabel={t('site.reports.loadMore')}
                disabled={loading}
                onPress={() => void load(page + 1)}
                style={styles.loadMore}
              >
                <MaterialIcons name="history" size={18} color={colors.primary} />
                <Text style={styles.loadMoreText}>{t('site.reports.loadMore')}</Text>
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => {
            const open = selectedReportId === item.report_id;
            return (
              <TouchableOpacity
                testID="report-item"
                style={screen.item}
                onPress={() => setSelectedReportId(open ? null : item.report_id)}
              >
                <Text style={screen.itemTitle}>{formatDate(item.report_date)}</Text>
                {item.summary ? <Text style={styles.sub}>{item.summary}</Text> : null}
                <StatusChip label={item.status} />

                {open ? (
                  <View testID="material-form" style={styles.matForm}>
                    <Text style={styles.matHeading}>{t('site.reports.materialTitle')}</Text>
                    <TextInput
                      testID="material-name-input"
                      style={styles.input}
                      placeholder={t('site.reports.materialPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      value={matName}
                      onChangeText={setMatName}
                    />
                    <View style={styles.qtyRow}>
                      <TextInput
                        testID="material-qty-input"
                        style={[styles.input, styles.qtyInput]}
                        placeholder={t('site.reports.qtyPlaceholder')}
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="decimal-pad"
                        value={qty}
                        onChangeText={setQty}
                      />
                      <TextInput
                        testID="material-unit-input"
                        style={[styles.input, styles.qtyInput]}
                        placeholder={t('site.reports.unitPlaceholder')}
                        placeholderTextColor={colors.textSecondary}
                        value={unit}
                        onChangeText={setUnit}
                      />
                    </View>
                    <TouchableOpacity
                      testID="record-material-button"
                      style={[styles.button, !canRecord && screen.buttonDisabled]}
                      onPress={() => recordMaterial(item.report_id)}
                      disabled={!canRecord}
                    >
                      <Text style={screen.primaryButtonText}>{t('site.reports.record')}</Text>
                    </TouchableOpacity>
                    {savedFor === item.report_id ? (
                      <Text testID="material-saved" style={styles.saved}>
                        {t('site.reports.recorded')}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      </LoadingBoundary>

      {/* The drawing's floating "+" (mockup 04_se_reports). It pushes the daily-report FORM, which
          is the singular `/report` route — a different screen from this plural review list that
          shares the word. That form is a tab for no role since 2026-08-08 and is reached from
          quick-action menus, so this list previously had no way to start the thing it lists. */}
      <TouchableOpacity
        testID="reports-fab"
        accessibilityRole="button"
        accessibilityLabel={t('site.reports.newReport')}
        onPress={() => router.push('/report')}
        style={styles.fab}
      >
        <MaterialIcons name="add" size={28} color={colors.bg} />
      </TouchableOpacity>
    </View>
  );
}

// ── EXECUTIVE — AI executive summary ──────────────────────────────────────────
interface ExecReportResponse {
  content: { executive_summary?: unknown };
  low_confidence: boolean;
}

type ExecState = 'idle' | 'loading' | 'unavailable' | 'error';

function ExecReports() {
  const { t } = useI18n();
  const accessToken = useAuthStore((s) => s.accessToken);
  const userId = useAuthStore((s) => s.userId);
  const [projectId, setProjectId] = useState('');
  const [summary, setSummary] = useState<string | null>(null);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [state, setState] = useState<ExecState>('idle');

  const generate = async (): Promise<void> => {
    setState('loading');
    setSummary(null);
    setLowConfidence(false);
    // tenant_id / generated_by come from the verified access-token claims (authStore has no tenantId).
    const claims = decodeJwtPayload(accessToken ?? '');
    const tenantId = typeof claims['tenant_id'] === 'string' ? (claims['tenant_id'] as string) : '';
    try {
      const res = await post<ExecReportResponse>('/ai/reports/executive-summary', {
        project_id: projectId,
        tenant_id: tenantId,
        generated_by: userId ?? 'system',
      });
      setSummary(
        typeof res.content?.executive_summary === 'string' ? res.content.executive_summary : null,
      );
      setLowConfidence(res.low_confidence);
      setState('idle');
    } catch (err) {
      // 503 = LLM provider is the Phase 11 stub → honest "unavailable" (not an error dump).
      setState(axios.isAxiosError(err) && err.response?.status === 503 ? 'unavailable' : 'error');
    }
  };

  return (
    <View testID="exec-reports-screen" style={screen.container}>
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TouchableOpacity
        testID="generate-report-button"
        style={[styles.button, (!projectId || state === 'loading') && screen.buttonDisabled]}
        onPress={generate}
        disabled={!projectId || state === 'loading'}
      >
        <Text style={screen.primaryButtonText}>
          {state === 'loading' ? t('exec.reports.generating') : t('exec.reports.generate')}
        </Text>
      </TouchableOpacity>

      {state === 'unavailable' ? (
        <Text testID="report-unavailable" style={styles.notice}>
          {t('exec.reports.unavailable')}
        </Text>
      ) : null}
      {state === 'error' ? <Text style={styles.error}>{t('exec.reports.error')}</Text> : null}

      {summary ? (
        <View testID="report-summary" style={styles.summaryCard}>
          {lowConfidence ? (
            <Text style={styles.lowConf}>{t('exec.reports.lowConfidence')}</Text>
          ) : null}
          <Text style={styles.summaryText}>{summary}</Text>
        </View>
      ) : state === 'idle' ? (
        <Text style={screen.empty}>{t('exec.reports.empty')}</Text>
      ) : null}
    </View>
  );
}

export default function ReportsScreen() {
  const role = useAuthStore((s) => s.role);
  return role === CosRole.EXECUTIVE ? <ExecReports /> : <SiteEngineerReports />;
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // The boundary occupies the list's space so the FlatList still fills the screen once revealed.
  listRegion: { flex: 1 },
  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.secondaryButton,
    marginTop: spacing.sm,
  },
  loadMoreText: {
    color: colors.primary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
  },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: touchTarget.listItem,
    height: touchTarget.listItem,
    borderRadius: touchTarget.listItem / 2, // a circle: half the width, off the radius scale (§32.7)
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sub: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  matForm: { marginTop: spacing.sm, gap: spacing.xs },
  matHeading: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  qtyRow: { flexDirection: 'row', gap: spacing.xs },
  qtyInput: { flex: 1 },
  button: {
    minHeight: 44,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saved: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  notice: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  error: {
    color: colors.danger,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  summaryCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  lowConf: {
    color: colors.danger,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  summaryText: {
    color: colors.textPrimary,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
  },
});
