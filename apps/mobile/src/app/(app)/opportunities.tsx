// Opportunities screen — CRM_SALES_MANAGER: create from a lead, convert won → Customer (§20.7.10).
//
// Two actions, both taken verbatim from the spec row, and both with a server-side rule this screen
// has to respect rather than re-implement:
//
//   1. CREATE requires a `lead_id` (CreateOpportunityDto) — an opportunity cannot exist free-standing,
//      because creating one is what QUALIFIES its lead (crm.service.ts). So the form is a lead picker
//      plus a title, not a blank form. Only NEW/QUALIFIED leads are offered: a DISQUALIFIED lead is
//      not a candidate, and offering it would invite a pointless round-trip.
//
//   2. CONVERT is terminal. The server sets the opportunity to WON and inserts finance.customers in
//      one call, and rejects a second attempt with COS-CRM-003 ("already converted"). A WON row
//      therefore renders NO convert control at all — the state itself is the affordance. `value` is
//      a DECIMAL string end-to-end and is never parsed into a JS number (§14 precision).
//
// Online-only for the reason given in api/crm.ts: a queued convert replayed hours later could only
// ever come back as a stale COS-CRM-003.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useT } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { makeScreenStyles } from '../../theme/screenStyles';
import { radius } from '../../theme/tokens';
import type { Palette } from '../../theme/palette';
import { StatusChip } from '../../components/StatusChip';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { loadProgress } from '../../lib/loadingState';
import {
  listLeads,
  listOpportunities,
  createOpportunity,
  convertOpportunity,
  type Lead,
  type Opportunity,
} from '../../api/crm';

export default function OpportunitiesScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const dark = useIsDark();
  const s = makeScreenStyles(p);
  const styles = useMemo(() => makeStyles(p), [p]);

  const [rows, setRows] = useState<Opportunity[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  // Honest load progress: two independent fetches, counted as each lands (Rule 40).
  const [settled, setSettled] = useState(0);
  const LOAD_STEPS = 2;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setSettled(0);
    const step = <T,>(p: Promise<T>): Promise<T> => {
      void p.finally(() => setSettled((n) => n + 1));
      return p;
    };
    try {
      const [opps, allLeads] = await Promise.all([step(listOpportunities()), step(listLeads())]);
      setRows(opps);
      setLeads(allLeads.filter((l) => l.status !== 'DISQUALIFIED'));
    } catch {
      /* offline or forbidden — keep the last lists */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const canSave = leadId !== null && title.trim().length > 0;

  const onCreate = async (): Promise<void> => {
    if (!canSave || saving || leadId === null) return;
    setSaving(true);
    try {
      const created = await createOpportunity({
        lead_id: leadId,
        title: title.trim(),
        // Sent only when filled — `value` is optional, and '' is not a valid DECIMAL string.
        ...(value.trim() ? { value: value.trim() } : {}),
      });
      setRows((current) => [created, ...current]);
      setTitle('');
      setValue('');
      setLeadId(null);
      // Creating an opportunity qualifies the lead server-side, so the picker's copy of that lead's
      // status is now stale. Refetch rather than patch it locally and risk disagreeing with the server.
      void load();
    } catch {
      /* surfaced by the row not appearing */
    } finally {
      setSaving(false);
    }
  };

  const onConvert = async (opportunityId: string): Promise<void> => {
    if (busyId !== null) return;
    setBusyId(opportunityId);
    try {
      await convertOpportunity(opportunityId);
      // The server flipped the row to WON; reflect exactly that and nothing more. The new customer
      // is visible on the Customers tab, which reads finance.customers directly.
      setRows((current) =>
        current.map((o) => (o.opportunity_id === opportunityId ? { ...o, status: 'WON' } : o)),
      );
    } catch {
      /* already converted or offline — the row keeps its current status */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View testID="opportunities-screen" style={s.container}>
      <Text style={s.heading}>{t('crm.opportunities.title')}</Text>

      {/* Lead picker — a WRAPPING row of chips, not a horizontal ScrollView.
          The ScrollView version rendered nothing at all on device: the chips were in the tree (a
          probe confirmed 4 leads in state) but a horizontal ScrollView inside this column container
          would not lay them out, and giving it an explicit height only reserved blank space. A
          wrapping View has no such failure mode, and it has the better property anyway — every
          candidate lead is visible at once instead of some being hidden off-screen, which matters
          because choosing one is MANDATORY before an opportunity can be created. */}
      <Text style={s.kvKey}>{t('crm.opportunities.fromLead')}</Text>
      <View style={styles.chipRow}>
        {leads.length === 0 ? <Text style={s.empty}>{t('crm.opportunities.noLeads')}</Text> : null}
        {leads.map((l) => {
          const selected = l.lead_id === leadId;
          return (
            <Pressable
              key={l.lead_id}
              testID={`opp-lead-${l.lead_id}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={l.company ?? l.contact_name ?? l.lead_id}
              onPress={() => setLeadId(selected ? null : l.lead_id)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                numberOfLines={1}
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {l.company ?? l.contact_name ?? t('crm.leads.untitled')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextInput
        testID="opp-title-input"
        style={s.input}
        value={title}
        onChangeText={setTitle}
        placeholder={t('crm.opportunities.titleField')}
        placeholderTextColor={p.muted}
        accessibilityLabel={t('crm.opportunities.titleField')}
      />
      <TextInput
        testID="opp-value-input"
        style={s.input}
        value={value}
        onChangeText={setValue}
        placeholder={t('crm.opportunities.value')}
        placeholderTextColor={p.muted}
        keyboardType="numeric"
        accessibilityLabel={t('crm.opportunities.value')}
      />
      <Pressable
        testID="create-opportunity-button"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave || saving }}
        accessibilityLabel={t('crm.opportunities.create')}
        disabled={!canSave || saving}
        onPress={onCreate}
        style={[s.primaryButton, (!canSave || saving) && s.buttonDisabled]}
      >
        <Text style={s.primaryButtonText}>
          {saving ? t('crm.opportunities.saving') : t('crm.opportunities.create')}
        </Text>
      </Pressable>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={dark ? 'dark' : 'light'}
        progress={loadProgress(settled, LOAD_STEPS) ?? undefined}
      >
        <FlatList
          testID="opportunity-list"
          data={rows}
          keyExtractor={(r) => r.opportunity_id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={<Text style={s.empty}>{t('crm.opportunities.empty')}</Text>}
          renderItem={({ item }) => {
            const busy = busyId === item.opportunity_id;
            return (
              <View testID="opportunity-item" style={s.item}>
                <Text style={s.itemTitle}>{item.title}</Text>
                {item.value ? (
                  <View style={s.kvRow}>
                    <Text style={s.kvKey}>{t('crm.opportunities.value')}</Text>
                    <Text style={s.kvValue}>{item.value}</Text>
                  </View>
                ) : null}
                <StatusChip label={item.status} />
                {/* Convert is offered only while the row can still be converted. WON is terminal
                    (COS-CRM-003) and LOST is not a customer. */}
                {item.status === 'OPEN' ? (
                  <Pressable
                    testID={`convert-${item.opportunity_id}`}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    accessibilityLabel={t('crm.opportunities.convert')}
                    disabled={busy}
                    onPress={() => onConvert(item.opportunity_id)}
                    style={[s.primaryButton, busy && s.buttonDisabled]}
                  >
                    <Text style={s.primaryButtonText}>
                      {busy ? t('crm.opportunities.converting') : t('crm.opportunities.convert')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      </LoadingBoundary>
    </View>
  );
}

// Lead-picker chips are this screen's own variant, so they stay local rather than joining
// screenStyles (the same rule that module's header sets out).
const makeStyles = (p: Palette) =>
  StyleSheet.create({
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    // 44 min height = §32.7 touch target; the picker is a real control, not a label.
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      minHeight: 44,
      maxWidth: '100%',
      justifyContent: 'center',
    },
    chipSelected: { backgroundColor: p.primary, borderColor: p.primary },
    chipText: { color: p.text },
    chipTextSelected: { color: p.onPrimary },
  });
