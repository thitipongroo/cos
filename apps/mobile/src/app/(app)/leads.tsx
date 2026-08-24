// Leads screen — CRM_SALES_MANAGER: list + create leads (§20.7.10).
//
// Create is the point of this screen being on a phone at all: a lead arrives as a phone call or a
// site-gate conversation, and the capture has to happen before the details are lost. Every field on
// CreateLeadDto is optional server-side, so the only rule enforced here is "say who or which
// company" — a lead with neither is a row nobody can follow up, and the server would accept it.
//
// Online-only (api/crm.ts uses post(), not mutate()): unlike a site report, a lead captured offline
// and replayed later has no ordering hazard worth the queue's complexity, and a failed POST that
// surfaces immediately lets the user fall back to writing it down.
//
// Status is shown per row because it drives the next step: only a NEW/QUALIFIED lead is a candidate
// for an opportunity, and the Opportunities screen filters on exactly that.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, Pressable, RefreshControl } from 'react-native';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { makeScreenStyles } from '../../theme/screenStyles';
import { StatusChip } from '../../components/StatusChip';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { listLeads, createLead, type Lead } from '../../api/crm';

/**
 * One lead, memoized. /crm/leads has no LIMIT, so this is the row of a list that grows with the
 * tenant's whole pipeline; the title is a fallback chain and belongs with the row that draws it.
 */
const LeadItem = memo(function LeadItem({
  lead,
  s,
  t,
}: {
  lead: Lead;
  s: ReturnType<typeof makeScreenStyles>;
  t: TranslateFn;
}) {
  return (
    <View testID="lead-item" style={s.item}>
      <Text style={s.itemTitle}>
        {lead.company ?? lead.contact_name ?? t('crm.leads.untitled')}
      </Text>
      {/* Both are shown when both exist — the title already used one of them. */}
      {lead.company && lead.contact_name ? <Text style={s.kvKey}>{lead.contact_name}</Text> : null}
      <StatusChip label={lead.status} />
    </View>
  );
});

export default function LeadsScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const dark = useIsDark();
  const s = useMemo(() => makeScreenStyles(p), [p]);

  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactName, setContactName] = useState('');
  const [company, setCompany] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setRows(await listLeads());
    } catch {
      /* offline or forbidden — keep the last list rather than blanking it */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // One of the two identifying fields must be present — see the header note.
  const canSave = contactName.trim().length > 0 || company.trim().length > 0;

  const onCreate = async (): Promise<void> => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const created = await createLead({
        contact_name: contactName.trim() || undefined,
        company: company.trim() || undefined,
      });
      // Prepend rather than refetch: the list is ordered created_at DESC, so the new row belongs at
      // the top, and the user sees the capture land even if the network drops right after.
      setRows((current) => [created, ...current]);
      setContactName('');
      setCompany('');
    } catch {
      /* surfaced by the row not appearing; no fabricated success state */
    } finally {
      setSaving(false);
    }
  };

  const renderLead = useCallback(
    ({ item }: { item: Lead }) => <LeadItem lead={item} s={s} t={t} />,
    [s, t],
  );

  return (
    <View testID="leads-screen" style={s.container}>
      <Text style={s.heading}>{t('crm.leads.title')}</Text>

      <TextInput
        testID="lead-contact-input"
        style={s.input}
        value={contactName}
        onChangeText={setContactName}
        placeholder={t('crm.leads.contactName')}
        placeholderTextColor={p.muted}
        accessibilityLabel={t('crm.leads.contactName')}
      />
      <TextInput
        testID="lead-company-input"
        style={s.input}
        value={company}
        onChangeText={setCompany}
        placeholder={t('crm.leads.company')}
        placeholderTextColor={p.muted}
        accessibilityLabel={t('crm.leads.company')}
      />
      <Pressable
        testID="create-lead-button"
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSave || saving }}
        accessibilityLabel={t('crm.leads.create')}
        disabled={!canSave || saving}
        onPress={onCreate}
        style={[s.primaryButton, (!canSave || saving) && s.buttonDisabled]}
      >
        <Text style={s.primaryButtonText}>
          {saving ? t('crm.leads.saving') : t('crm.leads.create')}
        </Text>
      </Pressable>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={dark ? 'dark' : 'light'}
      >
        <FlatList
          testID="lead-list"
          data={rows}
          keyExtractor={(r) => r.lead_id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={<Text style={s.empty}>{t('crm.leads.empty')}</Text>}
          renderItem={renderLead}
        />
      </LoadingBoundary>
    </View>
  );
}
