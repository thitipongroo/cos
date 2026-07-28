// Material requisition — raise a purchase request from site.
//
// Reached from the Site Engineer Home's quick actions (router.push), not a bottom-nav tab: master
// §Phase 10 fixes each role's tab set and none of them list it.
//
// SITE_ENGINEER holds RW on purchase requests (06-rbac-permission-matrix "Purchase requests"), which
// is what makes this a field screen rather than a procurement-desk one. The document number is not
// asked for — the server allocates PR-<year>-<seq>.
//
// Dark surface: opened from the dark Site Engineer Home (§32.7 "Mobile Dark Surfaces").

import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { createPurchaseRequest, type PurchaseRequestItem } from '../../api/procurement';
import { ProjectPicker } from '../../components/ProjectPicker';
import { useI18n } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

interface DraftItem {
  description: string;
  quantity: string; // kept as text: a half-typed "1." is not a number yet
  unit: string;
}

const EMPTY_ITEM: DraftItem = { description: '', quantity: '', unit: '' };

/** A line is submittable once it names something and a positive amount of it. */
function toItem(d: DraftItem): PurchaseRequestItem | null {
  const description = d.description.trim();
  const quantity = Number(d.quantity);
  const unit = d.unit.trim();
  if (!description || !unit || !Number.isFinite(quantity) || quantity <= 0) return null;
  return { description, quantity, unit };
}

export default function MaterialRequestScreen() {
  const { t } = useI18n();
  const [projectId, setProjectId] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [drafts, setDrafts] = useState<DraftItem[]>([{ ...EMPTY_ITEM }]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const items = drafts.map(toItem).filter((i): i is PurchaseRequestItem => i !== null);
  const canSubmit = projectId.trim() !== '' && items.length > 0 && !busy;

  const setDraft = (index: number, patch: Partial<DraftItem>): void =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const onSubmit = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await createPurchaseRequest({
        projectId: projectId.trim(),
        requiredDate: requiredDate.trim() || undefined,
        items,
      });
      // mutate() returns {queued:true} when it was stored for replay instead of sent.
      const queued = typeof res === 'object' && res !== null && 'queued' in res;
      setMessage(queued ? t('materialRequest.queued') : t('materialRequest.created'));
      setDrafts([{ ...EMPTY_ITEM }]);
      setRequiredDate('');
    } catch {
      setMessage(t('materialRequest.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      testID="material-request-screen"
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} variant="dark" />

      {drafts.map((d, i) => (
        <View key={i} testID={`item-${i}`} style={styles.card}>
          <Text style={styles.label}>{t('materialRequest.item', { n: i + 1 })}</Text>
          <TextInput
            testID={`item-${i}-description`}
            style={styles.input}
            value={d.description}
            onChangeText={(v) => setDraft(i, { description: v })}
            placeholder={t('materialRequest.descriptionPlaceholder')}
            placeholderTextColor={darkColors.muted}
          />
          <View style={styles.row}>
            <TextInput
              testID={`item-${i}-quantity`}
              style={[styles.input, styles.half]}
              value={d.quantity}
              onChangeText={(v) => setDraft(i, { quantity: v })}
              keyboardType="numeric"
              placeholder={t('materialRequest.quantityPlaceholder')}
              placeholderTextColor={darkColors.muted}
            />
            <TextInput
              testID={`item-${i}-unit`}
              style={[styles.input, styles.half]}
              value={d.unit}
              onChangeText={(v) => setDraft(i, { unit: v })}
              placeholder={t('materialRequest.unitPlaceholder')}
              placeholderTextColor={darkColors.muted}
            />
          </View>
          {drafts.length > 1 ? (
            <TouchableOpacity
              testID={`item-${i}-remove`}
              style={styles.remove}
              onPress={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}
            >
              <Text style={styles.removeText}>{t('materialRequest.removeItem')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      <TouchableOpacity
        testID="add-item"
        style={styles.addItem}
        onPress={() => setDrafts((prev) => [...prev, { ...EMPTY_ITEM }])}
      >
        <MaterialIcons name="add" size={18} color={darkColors.primary} />
        <Text style={styles.addItemText}>{t('materialRequest.addItem')}</Text>
      </TouchableOpacity>

      <Text style={styles.label}>{t('materialRequest.requiredDate')}</Text>
      <TextInput
        testID="required-date"
        style={styles.input}
        value={requiredDate}
        onChangeText={setRequiredDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={darkColors.muted}
      />

      <TouchableOpacity
        testID="submit-request"
        style={[styles.submit, !canSubmit && styles.disabled]}
        onPress={onSubmit}
        disabled={!canSubmit}
      >
        <Text style={styles.submitText}>{t('materialRequest.submit')}</Text>
      </TouchableOpacity>

      {message ? (
        <Text testID="material-request-status" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: darkColors.bg },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    backgroundColor: darkColors.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  label: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.medium,
    color: darkColors.muted,
  },
  input: {
    minHeight: touchTarget.formInput,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    backgroundColor: darkColors.elevated,
  },
  row: { flexDirection: 'row', gap: spacing.xs },
  half: { flex: 1 },
  remove: { minHeight: touchTarget.secondaryButton, justifyContent: 'center' },
  removeText: {
    color: darkColors.danger,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
  },
  addItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.secondaryButton,
  },
  addItemText: {
    color: darkColors.primary,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  submit: {
    minHeight: touchTarget.primaryButton,
    borderRadius: 8,
    backgroundColor: darkColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  disabled: { opacity: 0.5 },
  submitText: {
    color: darkColors.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
  },
  message: {
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
});
