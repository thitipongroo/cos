// Privacy Policy → Inquiry submitted
// (mockup/mobile/01_authen/05_privacy_policy/08_data_protection_submit_success).
//
// Reached with router.replace from the form, carrying the reference and timestamp the server
// returned. Nothing here is fabricated: both values come off the response, and the screen shows
// nothing the platform cannot stand behind.
//
// THREE THINGS THE DRAWING SHOWS THAT THIS SCREEN DOES NOT:
//   - an "SHA-256 Integrity Hash" of the submission. A digest of a message the sender still holds
//     proves only that the stored row was not edited afterwards, which is what the append-only audit
//     log already provides — and computing one here would hash the request body on the DEVICE, which
//     evidences nothing about what the server stored. What the sender needs is a handle they can
//     quote; that is the reference.
//   - "Source Channel: Secure Inquiry API v2.4". There is no such version. The API is v1.
//   - "We will process and respond within 30 days as per PDPA/GDPR regulations." The §30 clock runs
//     for the CONTROLLER, and for CRM/vendor contact data the controller is the tenant, not this
//     platform (ADR-090 §1, ADR-091 §3). Printing a statutory deadline the platform is not the
//     addressee of would be a promise made on someone else's behalf. The copy states the platform's
//     own commitment — to route the inquiry to the controller — and says who the deadline binds.
//
// A TERMINAL SCREEN: there is no back control, because the form behind it was replaced and there is
// nothing to return to. The single action closes the whole stack back to login.

import { View, Text, ScrollView, Pressable, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { paletteFor } from '../../theme/palette';

const DARK = paletteFor('dark');

export default function PrivacyContactSentScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, formatDate } = useI18n();
  const params = useLocalSearchParams<{ reference?: string; receivedAt?: string }>();

  const reference = params.reference ?? '';
  const receivedAt = params.receivedAt ?? '';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('privacy.contactSent.title')}
        </Text>
      </View>

      <ScrollView
        testID="privacy-contact-sent"
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <View style={styles.successRing}>
          <MaterialIcons name="check-circle" size={64} color={DARK.success} />
        </View>

        <Text style={styles.headline}>{t('privacy.contactSent.headline')}</Text>
        <Text style={styles.lede}>{t('privacy.contactSent.lede')}</Text>

        {/* The reference card. The status pill says PENDING REVIEW as the drawing does, and it is
            true: the row is created with status OPEN and nothing has triaged it yet. */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardLabel}>{t('privacy.contactSent.referenceLabel')}</Text>
            <View style={styles.pendingChip}>
              <Text style={styles.pendingText}>{t('privacy.contactSent.pending')}</Text>
            </View>
          </View>
          <Text testID="privacy-contact-reference" style={styles.reference} selectable>
            {reference}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.cardBody}>{t('privacy.contactSent.referenceHelp')}</Text>
        </View>

        {/* What happens next — stated as the platform's own commitment, and naming who the statutory
            deadline actually binds. */}
        <View style={styles.card}>
          <View style={styles.noteHead}>
            <MaterialIcons name="info" size={20} color={DARK.accent} />
            <Text style={styles.noteTitle}>{t('privacy.contactSent.nextTitle')}</Text>
          </View>
          <Text style={styles.cardBody}>{t('privacy.contactSent.nextBody')}</Text>
        </View>

        {receivedAt !== '' ? (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>{t('privacy.contactSent.receivedLabel')}</Text>
            <Text style={styles.received}>{formatDate(receivedAt)}</Text>
          </View>
        ) : null}

        <Pressable
          testID="privacy-contact-sent-done"
          accessibilityRole="button"
          accessibilityLabel={t('privacy.contactSent.done')}
          onPress={() => router.dismissAll()}
          style={styles.doneButton}
        >
          <Text style={styles.doneText}>{t('privacy.contactSent.done')}</Text>
        </Pressable>
      </ScrollView>
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
    borderBottomWidth: 1,
    borderBottomColor: DARK.border,
    backgroundColor: DARK.surface,
  },
  // No back control: the form was replaced, so there is nothing behind this screen.
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    color: DARK.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, gap: spacing.md },

  successRing: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: 999, // a circle — the documented capsule marker, not a literal half-width (§32.7)
    borderWidth: 1,
    borderColor: DARK.success,
    backgroundColor: DARK.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },

  headline: {
    textAlign: 'center',
    color: DARK.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.hero.fontSize,
    lineHeight: typography.hero.lineHeight,
  },
  lede: {
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 280,
    color: DARK.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    marginBottom: spacing.md,
  },

  card: {
    borderWidth: 1,
    borderColor: DARK.border,
    borderRadius: radius.lg,
    backgroundColor: DARK.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: {
    color: DARK.muted,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  pendingChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: DARK.warning,
    backgroundColor: DARK.elevated,
  },
  pendingText: {
    color: DARK.warning,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  // Monospace: the reference is retyped into an email, and a proportional face makes 0/O and 1/l
  // ambiguous at the moment it matters most. The alphabet already excludes those characters; the face
  // is the second layer.
  reference: {
    color: DARK.accent,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: typography.title.fontSize,
    letterSpacing: 1,
  },
  divider: { height: 1, backgroundColor: DARK.border, marginVertical: spacing.xs },
  cardBody: {
    color: DARK.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  noteHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  noteTitle: {
    color: DARK.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },

  received: {
    color: DARK.text,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },

  doneButton: {
    marginTop: spacing.md,
    minHeight: touchTarget.primaryButton,
    borderRadius: radius.md,
    backgroundColor: DARK.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  doneText: {
    color: DARK.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
