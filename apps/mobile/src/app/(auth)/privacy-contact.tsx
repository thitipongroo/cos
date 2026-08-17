// Privacy Policy → Contact the Data Protection Office
// (mockup/mobile/01_authen/03_privacy_policy/06_data_protection_contact).
//
// Pushed from the DPO contact row on (auth)/privacy-policy. Pre-auth: the sender has no account, and
// `POST /privacy/inquiries` is the one write in this app that reaches the backend with no token at
// all (ADR-091). The screen is pinned dark for the same reason every other pre-auth screen is —
// §32.7, the theme preference is per-user and there is no user yet.
//
// THE ATTACHMENT CONTROL IS RENDERED DISABLED, not omitted (ADR-091 §2). An unauthenticated multipart
// upload is a new external surface needing its own STRIDE row, ClamAV scanning and quarantine, and a
// size budget a rate limit alone does not give — and none of it is required to lodge a request, since
// PDPA §30 asks the controller to answer rather than the subject to prove anything up front. Keeping
// the affordance visible and labelled is the same call the PO made for the policy download.
//
// THE FORM DOES NOT CLAIM TO START A STATUTORY CLOCK. The success screen states the platform's own
// response commitment; the §30 deadline runs from when the CONTROLLER — the tenant — receives the
// request, which is what `subject_requests.received_at` records once an inquiry is routed.

import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { LoadingState } from '../../components/LoadingState';
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { paletteFor } from '../../theme/palette';
import { INQUIRY_CATEGORIES, submitPrivacyInquiry } from '../../api/privacyInquiry';
import type { InquiryCategory } from '../../api/privacyInquiry';

const DARK = paletteFor('dark');

/** Mirrors the DTO caps in backend/.../create-privacy-inquiry.dto.ts, so the field stops before the
 *  server does — a 400 on a form the user already filled in is a worse experience than a maxLength. */
const LIMIT = { name: 255, email: 255, phone: 50, subject: 255, message: 5000 } as const;

export default function PrivacyContactScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState<InquiryCategory>('GENERAL');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Required-field check only, and deliberately not an email regex: the server validates the address
  // with class-validator (QM-4) and a second, different rule on the client would reject addresses the
  // server accepts. Trimmed, because a space is not an answer.
  const complete =
    fullName.trim() !== '' && email.trim() !== '' && subject.trim() !== '' && message.trim() !== '';

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const receipt = await submitPrivacyInquiry({
        full_name: fullName.trim(),
        email: email.trim(),
        ...(phone.trim() === '' ? {} : { phone: phone.trim() }),
        category,
        subject: subject.trim(),
        message: message.trim(),
      });
      // replace, not push: the form is finished and there is nothing to come back to. Back from the
      // receipt should reach the policy, not a form still holding what was just sent.
      router.replace({
        pathname: '/(auth)/privacy-contact-sent',
        params: { reference: receipt.reference, receivedAt: receipt.received_at },
      });
    } catch {
      // No server text is surfaced. This route is unauthenticated, so an upstream message could carry
      // detail about the platform that a stranger has no business reading; the i18n string says what
      // to do instead.
      setError(t('privacy.contact.error'));
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          testID="privacy-contact-back"
          accessibilityRole="button"
          accessibilityLabel={t('privacy.policy.back')}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('privacy.contact.title')}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          testID="privacy-contact"
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          keyboardShouldPersistTaps="handled"
        >
          <Field label={t('privacy.contact.fields.fullName')}>
            <TextInput
              testID="privacy-contact-name"
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              maxLength={LIMIT.name}
              autoCapitalize="words"
              autoComplete="name"
              placeholder={t('privacy.contact.placeholders.fullName')}
              placeholderTextColor={DARK.muted}
              accessibilityLabel={t('privacy.contact.fields.fullName')}
            />
          </Field>

          <Field label={t('privacy.contact.fields.email')}>
            <TextInput
              testID="privacy-contact-email"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              maxLength={LIMIT.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder={t('privacy.contact.placeholders.email')}
              placeholderTextColor={DARK.muted}
              accessibilityLabel={t('privacy.contact.fields.email')}
            />
          </Field>

          <Field
            label={t('privacy.contact.fields.phone')}
            optional
            optionalLabel={t('common.optional')}
          >
            <TextInput
              testID="privacy-contact-phone"
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              maxLength={LIMIT.phone}
              keyboardType="phone-pad"
              autoComplete="tel"
              placeholder={t('privacy.contact.placeholders.phone')}
              placeholderTextColor={DARK.muted}
              accessibilityLabel={t('privacy.contact.fields.phone')}
            />
          </Field>

          {/* Chips, not a <select>. §32.7 prohibits a dropdown of this size on mobile when the whole
              option set fits on screen — five chips are one tap each, a picker is three. */}
          <Field label={t('privacy.contact.fields.category')}>
            <View style={styles.chipRow}>
              {INQUIRY_CATEGORIES.map((option) => {
                const on = option === category;
                return (
                  <Pressable
                    key={option}
                    testID={`privacy-contact-category-${option}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t(`privacy.contact.categories.${option}`)}
                    onPress={() => setCategory(option)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {t(`privacy.contact.categories.${option}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <Field label={t('privacy.contact.fields.subject')}>
            <TextInput
              testID="privacy-contact-subject"
              style={styles.input}
              value={subject}
              onChangeText={setSubject}
              maxLength={LIMIT.subject}
              placeholder={t('privacy.contact.placeholders.subject')}
              placeholderTextColor={DARK.muted}
              accessibilityLabel={t('privacy.contact.fields.subject')}
            />
          </Field>

          <Field label={t('privacy.contact.fields.message')}>
            <TextInput
              testID="privacy-contact-message"
              style={[styles.input, styles.textArea]}
              value={message}
              onChangeText={setMessage}
              maxLength={LIMIT.message}
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              placeholder={t('privacy.contact.placeholders.message')}
              placeholderTextColor={DARK.muted}
              accessibilityLabel={t('privacy.contact.fields.message')}
            />
          </Field>

          {/* Disabled — ADR-091 §2. Kept visible so the drawing is honoured and so the absence is a
              stated state rather than a missing control. */}
          <Field label={t('privacy.contact.fields.attachment')}>
            <Pressable
              testID="privacy-contact-attach"
              accessibilityRole="button"
              accessibilityState={{ disabled: true }}
              accessibilityLabel={`${t('privacy.contact.attach')} — ${t('privacy.policy.comingSoon')}`}
              disabled
              style={styles.attachButton}
            >
              <MaterialIcons name="attach-file" size={20} color={DARK.muted} />
              <Text style={styles.attachText}>{t('privacy.contact.attach')}</Text>
              <View style={styles.comingSoonChip}>
                <Text style={styles.comingSoonText}>{t('privacy.policy.comingSoon')}</Text>
              </View>
            </Pressable>
          </Field>

          {error !== null ? (
            <Text testID="privacy-contact-error" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Pressable
            testID="privacy-contact-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: !complete || busy }}
            accessibilityLabel={t('privacy.contact.submit')}
            disabled={!complete || busy}
            onPress={() => void submit()}
            style={[styles.submitButton, (!complete || busy) && styles.submitButtonOff]}
          >
            {busy ? (
              // Wordless by design (Rule 40(e)): one request can only report 0% then 100%, so a
              // percentage here would never move and would read as a stuck loader.
              <LoadingState variant="micro" theme="dark" tone="onPrimary" />
            ) : (
              <>
                <MaterialIcons name="send" size={20} color={DARK.onPrimary} />
                <Text style={styles.submitText}>{t('privacy.contact.submit')}</Text>
              </>
            )}
          </Pressable>

          <View style={styles.assurance}>
            <MaterialIcons name="lock" size={20} color={DARK.success} />
            <Text style={styles.assuranceText}>{t('privacy.contact.assurance')}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Label over control, the shape every field on this screen takes. */
function Field({
  label,
  optional,
  optionalLabel,
  children,
}: {
  label: string;
  optional?: boolean;
  optionalLabel?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {optional === true && optionalLabel !== undefined ? (
          <Text style={styles.labelOptional}> {optionalLabel}</Text>
        ) : null}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK.bg },
  flex: { flex: 1 },

  header: {
    height: touchTarget.listItem,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: DARK.border,
    backgroundColor: DARK.surface,
  },
  backButton: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: DARK.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },

  field: { gap: spacing.xs },
  label: {
    color: DARK.muted,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  labelOptional: { fontFamily: fontFamily.regular, textTransform: 'none', letterSpacing: 0 },

  input: {
    minHeight: touchTarget.formInput,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: DARK.border,
    backgroundColor: DARK.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: DARK.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  textArea: { minHeight: 140 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    minHeight: touchTarget.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: DARK.border,
    backgroundColor: DARK.surface,
  },
  chipOn: { borderColor: DARK.primary, backgroundColor: DARK.elevated },
  chipText: {
    color: DARK.muted,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
  },
  // `accent`, not `primary`: this is unfilled text on a dark surface, so it must clear 4.5:1 itself
  // and --mobile-primary is 4.17:1 there (§20.8). The chip's BORDER keeps primary — a border is a
  // non-text mark at the 3:1 threshold.
  chipTextOn: { color: DARK.accent },

  attachButton: {
    minHeight: touchTarget.formInput,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: DARK.border,
    backgroundColor: DARK.elevated,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  attachText: {
    color: DARK.muted,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
  },
  comingSoonChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: DARK.border,
    backgroundColor: DARK.surface,
  },
  comingSoonText: {
    color: DARK.muted,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  error: {
    color: DARK.danger,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  submitButton: {
    marginTop: spacing.xs,
    minHeight: touchTarget.primaryButton,
    borderRadius: radius.md,
    backgroundColor: DARK.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  submitButtonOff: { backgroundColor: DARK.elevated, borderWidth: 1, borderColor: DARK.border },
  submitText: {
    color: DARK.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  assurance: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: DARK.border,
    alignItems: 'center',
    gap: spacing.xs,
  },
  assuranceText: {
    color: DARK.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
    textAlign: 'center',
    maxWidth: 280,
  },
});
