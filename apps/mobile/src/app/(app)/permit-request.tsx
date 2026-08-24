// Permit request — the form that raises a permit.
//
// Reference mockup: `mockup/mobile/07_safety_officer/04_permit_management/02_permit_request/`
// (code.html only; this is the one drawing in the role's set that ships no screen.png, so the layout
// below follows the markup rather than a capture).
//
// IT REPLACES AN INLINE COMPOSER. Until 2026-08-13 raising a permit was a panel that unfolded inside
// `permits.tsx` behind the FAB, collecting a type and a number and nothing else. The drawing makes it
// a screen, and it now collects everything the table can store.
//
// WHAT EACH FIELD WRITES, AND THE TWO THE DRAWING ASKS FOR THAT NOTHING CAN STORE:
//
//   Permit type      → permit_type. FOUR cards, not the drawing's four labels only: they map exactly
//                      onto the CHECK constraint's enum (20260619000002_tasks_permits).
//   Project          → project_id, from the active project. The drawing labels this field
//                      "Project / Sector" — there is NO sector column on a permit, on a project, or
//                      anywhere in §11, so the field names the project and nothing is invented.
//   Permit number    → permit_number. NOT DRAWN on the mockup, and kept anyway: the DTO requires it
//                      (@IsNotEmpty), and every other document number in this platform — pr_number,
//                      rfq_number, po_number, invoice_number — is supplied by the client. There is no
//                      server-side generator to fall back on (PO decision 2026-08-13).
//   Contractor       → contractor_name, added by migration 20260813000001. Free TEXT, not the
//                      drawing's "search registered contractors": a permit has no vendor link, and
//                      site_ops reaching into procurement.vendors is what master §4 forbids.
//   Start / End      → valid_from / valid_until via <DateField />, the app's first date control
//                      (PO decision 2026-08-13).
//   Description      → description, added by the same migration.
//   Photos           → captured against a DRAFT id and re-keyed to the real permit_id after the POST
//                      (see `reassignPhotoEntity`), because a permit's id does not exist until the
//                      server makes one.
//   AI ความสอดคล้อง   → NOTHING. There is no compliance-checking AI in this platform: `/ai/reports/*`
//                      covers site, procurement, executive and delay-risk only, and §22.3 forbids a
//                      surface reading as AI-derived while a placeholder serves it. Drawn, and marked.
//
// ONLINE ONLY. §17.4 lists no permit as offline-writable, so this uses `createPermit()` (a plain
// POST) and never enqueues. A failure keeps the form — and its draft photos — exactly as they were.

import { useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { createPermit, type PermitType } from '../../api/safety';
import { newLocalId } from '../../db/database';
import { reassignPhotoEntity } from '../../db/photoRepo';
import { DateField } from '../../components/DateField';
import { PhotoCapture } from '../../components/PhotoCapture';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { UnavailableNote } from '../../components/UnavailableNote';
import { useProjectStore } from '../../store/projectStore';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';
import { screenChrome } from '../../theme/screenStyles';

/** The four §11 permit types with the drawing's glyph for each, in the DTO enum's order. */
const PERMIT_TYPES: readonly { type: PermitType; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { type: 'WORK_PERMIT', icon: 'engineering' },
  { type: 'SAFETY_PERMIT', icon: 'health-and-safety' },
  { type: 'DRAWING_APPROVAL', icon: 'architecture' },
  { type: 'ENTRY_PERMIT', icon: 'door-front' },
];

export default function PermitRequestScreen(): React.JSX.Element {
  const router = useRouter();
  const { t } = useI18n();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);

  const projectId = useProjectStore((s) => s.active?.projectId ?? '');

  // Stable for the life of the screen: the id the photos hang on until the permit is real. A ref, not
  // state — regenerating it on a re-render would strand every photo captured before it changed.
  const draftId = useRef(newLocalId()).current;

  const [permitType, setPermitType] = useState<PermitType>('WORK_PERMIT');
  const [permitNumber, setPermitNumber] = useState('');
  const [contractor, setContractor] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = projectId !== '' && permitNumber.trim() !== '' && !submitting;

  const onSubmit = (): void => {
    setSubmitting(true);
    setError(null);
    void createPermit({
      project_id: projectId,
      permit_type: permitType,
      permit_number: permitNumber.trim(),
      // Empty strings are dropped rather than sent: '' would store a blank contractor, which is a
      // different claim from "not recorded".
      ...(contractor.trim() === '' ? {} : { contractor_name: contractor.trim() }),
      ...(description.trim() === '' ? {} : { description: description.trim() }),
      ...(validFrom === '' ? {} : { valid_from: validFrom }),
      ...(validUntil === '' ? {} : { valid_until: validUntil }),
    })
      .then(async (permit) => {
        // Re-key BEFORE navigating: the upload queue can run as soon as it sees the rows, and a photo
        // uploaded under the draft id would attach to nothing.
        await reassignPhotoEntity(draftId, permit.permit_id);
        router.replace({
          pathname: '/permit-submitted',
          params: {
            permitNumber: permit.permit_number,
            permitType: permit.permit_type,
            status: permit.status,
          },
        });
      })
      .catch(() => {
        // Inline, not an Alert: the form and its draft photos stay exactly as they were, so the
        // message belongs beside the button that will be pressed again.
        setError(t('safety.permitRequest.failed'));
        setSubmitting(false);
      });
  };

  return (
    <ScrollView
      testID="permit-request-screen"
      style={styles.root}
      contentContainerStyle={styles.page}
    >
      <ProjectContextBar />

      {/* PERMIT TYPE — the drawing's horizontal card row. */}
      <Text style={styles.fieldLabel}>{t('safety.permitRequest.typeLabel')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.typeRow}>
          {PERMIT_TYPES.map(({ type, icon }) => {
            const on = permitType === type;
            return (
              <TouchableOpacity
                key={type}
                testID={`permit-type-${type}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setPermitType(type)}
                style={[
                  styles.typeCard,
                  { borderColor: on ? p.primary : p.border, backgroundColor: p.surface },
                ]}
              >
                <MaterialIcons name={icon} size={22} color={on ? p.accent : p.muted} />
                <Text style={[styles.typeLabel, { color: on ? p.text : p.muted }]}>
                  {t(`safety.permits.type.${type}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {projectId === '' ? (
        <Text testID="permit-request-needs-project" style={styles.muted}>
          {t('safety.permits.needsProject')}
        </Text>
      ) : null}

      {/* AI ความสอดคล้อง — drawn, and there is no compliance AI to fill it. */}
      <UnavailableNote
        testID="permit-request-ai-unavailable"
        reason={t('safety.permitRequest.aiUnavailable')}
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('safety.permitRequest.numberLabel')}</Text>
        <TextInput
          testID="permit-number-input"
          style={styles.input}
          placeholder={t('safety.permits.numberPlaceholder')}
          placeholderTextColor={p.muted}
          value={permitNumber}
          onChangeText={setPermitNumber}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('safety.permitRequest.contractorLabel')}</Text>
        <TextInput
          testID="permit-contractor-input"
          style={styles.input}
          placeholder={t('safety.permitRequest.contractorPlaceholder')}
          placeholderTextColor={p.muted}
          value={contractor}
          onChangeText={setContractor}
        />
      </View>

      <View style={styles.dateRow}>
        <DateField
          testID="permit-valid-from"
          label={t('safety.permitRequest.startDate')}
          value={validFrom}
          onChange={setValidFrom}
          placeholder={t('safety.permitRequest.datePlaceholder')}
        />
        <DateField
          testID="permit-valid-until"
          label={t('safety.permitRequest.endDate')}
          value={validUntil}
          onChange={setValidUntil}
          placeholder={t('safety.permitRequest.datePlaceholder')}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{t('safety.permitRequest.descriptionLabel')}</Text>
        <TextInput
          testID="permit-description-input"
          style={[styles.input, styles.textarea]}
          placeholder={t('safety.permitRequest.descriptionPlaceholder')}
          placeholderTextColor={p.muted}
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* The drawing's 3-up photo grid. `strip` is this app's shape for "photos attached to a form"
          — the same one the daily report uses — rather than a live viewfinder held open while the
          rest of the form is filled in. */}
      <Text style={styles.fieldLabel}>{t('safety.permitRequest.photosLabel')}</Text>
      <PhotoCapture entityType="permit" entityId={draftId} layout="strip" />

      {error !== null ? (
        <Text testID="permit-request-error" style={[styles.muted, { color: p.danger }]}>
          {error}
        </Text>
      ) : null}

      <TouchableOpacity
        testID="submit-permit-request"
        accessibilityRole="button"
        accessibilityLabel={t('safety.permitRequest.submit')}
        onPress={onSubmit}
        disabled={!canSubmit}
        style={[styles.submit, !canSubmit && styles.disabled]}
      >
        <MaterialIcons name="send" size={18} color={p.onPrimary} />
        <Text style={styles.submitText}>{t('safety.permitRequest.submit')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    ...screenChrome(p),
    field: { gap: spacing.xs / 2 },
    fieldLabel: {
      color: p.muted,
      fontSize: 10,
      fontFamily: fontFamily.semibold,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    typeRow: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xs / 2 },
    typeCard: {
      width: 116,
      minHeight: 92,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
    },
    typeLabel: {
      textAlign: 'center',
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
    },
    input: {
      minHeight: touchTarget.formInput,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      backgroundColor: p.elevated,
      color: p.text,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.regular,
    },
    textarea: { minHeight: 88, paddingTop: spacing.sm, textAlignVertical: 'top' },
    dateRow: { flexDirection: 'row', gap: spacing.sm },
    submit: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.primaryButton + 4,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      marginTop: spacing.xs,
    },
    submitText: {
      color: p.onPrimary,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
  });
