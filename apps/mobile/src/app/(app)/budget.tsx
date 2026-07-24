// Budget screen — FINANCE: budget vs committed vs actual per project (read-only).
// Pick a project → GET /finance/budget/:projectId → { budget, lines, variance_percentage }.

import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { get } from '../../api/client';
import { ProjectPicker } from '../../components/ProjectPicker';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';

interface ProjectBudget {
  total_budget_amount: string;
  total_budget_currency: string;
  allocated_amount: string;
  committed_amount: string;
  actual_amount: string;
}

interface BudgetResponse {
  budget: ProjectBudget;
  lines: Array<{ line_id: string; line_name: string; allocated_amount: string }>;
  variance_percentage: string;
}

export default function BudgetScreen() {
  const [projectId, setProjectId] = useState('');
  const [data, setData] = useState<BudgetResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const onSelect = async (id: string): Promise<void> => {
    setProjectId(id);
    setError(null);
    try {
      setData(await get<BudgetResponse>(`/finance/budget/${id}`));
    } catch {
      setError(t('finance.budget.loadError'));
      setData(null);
    }
  };

  // Variance badge colour thresholds (master 3111): green < 5%, amber 5–10%, red > 10%.
  const varianceColor = (pct: number): string => {
    const abs = Math.abs(pct);
    if (abs > 10) return colors.danger;
    if (abs >= 5) return colors.warning;
    return colors.success;
  };

  const figures = data
    ? ([
        [
          t('finance.budget.totalBudget'),
          `${data.budget.total_budget_amount} ${data.budget.total_budget_currency}`,
          null,
        ],
        [t('finance.budget.allocated'), data.budget.allocated_amount, null],
        [t('finance.budget.committed'), data.budget.committed_amount, null],
        [t('finance.budget.actual'), data.budget.actual_amount, null],
        [
          t('finance.budget.variance'),
          `${data.variance_percentage}%`,
          varianceColor(Number(data.variance_percentage)),
        ],
      ] as Array<[string, string, string | null]>)
    : [];

  return (
    <ScrollView
      testID="budget-screen"
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={screen.heading}>{t('finance.budget.title')}</Text>
      <ProjectPicker selectedId={projectId} onSelect={onSelect} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {data ? (
        <>
          <View testID="budget-figures">
            {figures.map(([label, value, color]) => (
              <View key={label} style={screen.kvRow}>
                <Text style={screen.kvKey}>{label}</Text>
                <Text style={[screen.kvValue, color ? { color } : null]}>{value}</Text>
              </View>
            ))}
          </View>
          {data.lines.length > 0 ? (
            <View testID="budget-lines" style={styles.lines}>
              <Text style={styles.linesHeading}>{t('finance.budget.lines')}</Text>
              {data.lines.map((line) => (
                <View key={line.line_id} style={screen.kvRow}>
                  <Text style={screen.kvKey}>{line.line_name}</Text>
                  <Text style={screen.kvValue}>{line.allocated_amount}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <Text style={screen.empty}>{t('finance.budget.selectPrompt')}</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.sm },
  lines: { marginTop: spacing.md },
  linesHeading: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  error: {
    color: colors.danger,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
});
