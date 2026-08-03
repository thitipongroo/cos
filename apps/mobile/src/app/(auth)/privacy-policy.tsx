// Privacy Policy — mockup/mobile/01_authen/05_privacy_policy/00_policy_data.
//
// Route placement: this lives in the (auth) group on purpose. The root AuthGate
// (app/_layout.tsx) redirects every non-(auth) route to login while unauthenticated, and the screen
// is reached from the login footer, so an (app) route would be unreachable pre-login. PO decision
// 2026-08-03: reachable from the login footer only — no (app) duplicate.
//
// Content: the mockup's body copy is placeholder marketing text. Per PO decision 2026-08-03 the
// rendered policy is grounded in the real compliance record instead — docs/compliance/data-flow-map.md
// (PII categories, processors, subject rights), docs/compliance/data-retention-policy.md, QM-4 (§5.2
// encryption, TLS 1.3) and §7.7 (RLS). Three mockup claims were dropped because the repo contradicts
// or does not support them, and a privacy policy is a binding legal statement:
//   - "Hardware Security Modules (HSM)" — no occurrence of HSM anywhere in docs/specifications/.
//   - "Zero-Trust Network Access (ZTNA)" — the spec states zero-trust + Istio mTLS (§5.4); ZTNA as a
//     named access product is not what is deployed. Rendered as the mTLS service mesh it actually is.
//   - "Biometric hash for high-security zone access" — data-flow-map.md lists biometric as
//     "future — not in Stage 1", so claiming collection would be false.
// Same precedent as notification-preferences.tsx, which dropped mockup rows with no event-catalog
// backing rather than invent them.
//
// Data residency (sections.usage.residency) names the real regions. The apparent spec conflict was
// resolved 2026-08-03: §5.6 and docs/compliance/data-residency-policy.md agree that residency is
// PER TENANT (Thai → ap-southeast-7, EU → eu-west-1, otherwise ap-southeast-1) and is distinct from
// the platform's ap-southeast-7 control-plane region. docs/compliance/data-flow-map.md was the stale
// one — it pinned every flow to ap-southeast-1, which breaks PDPA for Thai tenants — and was
// corrected in the same change. The copy also discloses the one genuine cross-border hop: OTP SMS
// goes through the AWS SNS ap-southeast-1 endpoint (spec §5.3.1), so a Thai user's phone number does
// leave the region at sign-in.
//
// Dark surface + logo glow: §32.7 lists dark screens exhaustively and allows glow only on the pre-auth
// entry screens; both were ratified for this screen by PO decision 2026-08-03 and §32.7 updated.

import { useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  Vibration,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useI18n } from '../../i18n';
import { darkColors, fontFamily, spacing, typography, touchTarget } from '../../theme/tokens';
import appIcon from '../../../assets/icon.png';

// Effective version + date of the policy text below (PO decision 2026-08-03: v1.0.0, approved
// 2026-08-03). Bump BOTH whenever the policy copy in i18n changes — they are the document's identity,
// not decoration. Rendered through formatDate() so Thai shows the Buddhist era (QM-3).
const POLICY_VERSION = '1.0.0';
const POLICY_EFFECTIVE_DATE = '2026-08-03';

// Data Protection Office contact, supplied by configuration rather than hardcoded.
//
// There is no address to hardcode: no `dpo@` exists anywhere in the repo, and per
// docs/compliance/data-flow-map.md the DPO is an **External DPO** engaged at the Stage 2→3 gate —
// the appointment (spec §5.3 PDPA hard requirements) has not happened at Stage 1. Inventing an
// address on a PDPA notice is not acceptable: PDPA §37(3) requires the controller's contact to be a
// channel a data subject can actually reach.
//
// So the address is deployment config (EXPO_PUBLIC_DPO_EMAIL in .env), set the day the DPO is
// appointed with no code change. Unset → the contact row renders disabled and says so, instead of
// linking to an address that bounces.
const DPO_EMAIL: string | null = process.env['EXPO_PUBLIC_DPO_EMAIL']?.trim() || null;

// The five accordion sections, in mockup order. `icon`/`tint` reproduce the mockup's per-section
// colour coding; every body string resolves through i18n (QM-3).
interface PolicySection {
  id: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  tint: string;
  /** Paragraph keys rendered in order above the section's list/blocks. */
  paragraphs: readonly string[];
  /** Bulleted items (Data Collection). */
  bullets?: readonly string[];
  /** Pull-quote block (Data Usage). */
  quote?: string;
  /** Icon + text cards (PDPA & GDPR). */
  cards?: readonly { icon: keyof typeof MaterialIcons.glyphMap; key: string }[];
  /** Monospace control block, one line per entry (Technical Security). */
  controls?: readonly string[];
  /** Paragraph keys rendered after the list/blocks. */
  footNotes?: readonly string[];
}

const K = 'privacy.policy.sections';

const SECTIONS: readonly PolicySection[] = [
  {
    id: 'collection',
    icon: 'storage',
    tint: darkColors.cyan,
    paragraphs: [`${K}.collection.body`],
    // Verified 2026-08-03 against backend/prisma/migrations/ — every bullet here corresponds to a
    // column that actually exists. `nationalId` was removed: no national_id column exists anywhere,
    // so claiming collection would be a false statement on a PDPA notice. Same for date of birth
    // and bank account, which the earlier copy asserted (inherited from a stale data-flow-map).
    bullets: [
      `${K}.collection.items.identity`,
      `${K}.collection.items.contact`,
      `${K}.collection.items.location`,
      `${K}.collection.items.photos`,
      `${K}.collection.items.financial`,
    ],
    footNotes: [`${K}.collection.note`],
  },
  {
    id: 'usage',
    icon: 'insights',
    tint: darkColors.primary,
    paragraphs: [`${K}.usage.body`],
    quote: `${K}.usage.quote`,
    footNotes: [`${K}.usage.processors`, `${K}.usage.residency`],
  },
  {
    id: 'compliance',
    icon: 'gavel',
    tint: darkColors.success,
    paragraphs: [`${K}.compliance.body`],
    cards: [
      { icon: 'verified-user', key: `${K}.compliance.rights.access` },
      { icon: 'download', key: `${K}.compliance.rights.portability` },
      { icon: 'delete-forever', key: `${K}.compliance.rights.erasure` },
      { icon: 'pause-circle-outline', key: `${K}.compliance.rights.restrict` },
    ],
    footNotes: [`${K}.compliance.deadline`],
  },
  {
    id: 'security',
    icon: 'shield',
    tint: darkColors.warning,
    paragraphs: [`${K}.security.body`],
    controls: [
      `${K}.security.controls.atRest`,
      `${K}.security.controls.fieldLevel`,
      `${K}.security.controls.tls`,
      `${K}.security.controls.mesh`,
      `${K}.security.controls.isolation`,
    ],
    // PO decision 2026-08-03 — the "general notice + evidence elsewhere" split. The notice names the
    // controls in general-but-useful terms (the FTC's own guidance for security language in privacy
    // notices); certificate numbers, validation/sunset dates and per-control status live on the
    // public Trust Center (apps/web /trust), which is checkable by a reader.
    footNotes: [`${K}.security.trustCenter`],
  },
  {
    id: 'rights',
    icon: 'person-search',
    tint: darkColors.cyan,
    paragraphs: [`${K}.rights.body`, `${K}.rights.contact`],
  },
];

export default function PrivacyPolicyScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, formatDate } = useI18n();

  // One section open at a time — the mockup's exclusive accordion. `null` = all collapsed, matching
  // the mockup's initial state.
  const [openId, setOpenId] = useState<string | null>(null);

  const toggle = (id: string): void => {
    setOpenId((current) => (current === id ? null : id));
    // Mockup calls navigator.vibrate(5) on toggle. Android already declares VIBRATE in the manifest;
    // iOS ignores the duration argument and plays its standard tap, which is the intended feel.
    Vibration.vibrate(5);
  };

  const openDpoMail = (): void => {
    if (!DPO_EMAIL) return;
    void Linking.openURL(`mailto:${DPO_EMAIL}`);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Top app bar — back, title, and the encrypted-transport marker from the mockup. */}
      <View style={styles.header}>
        <Pressable
          testID="privacy-policy-back"
          accessibilityRole="button"
          accessibilityLabel={t('privacy.policy.back')}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('privacy.policy.title')}
        </Text>
        <View style={styles.headerBadge}>
          <MaterialIcons name="sync-lock" size={18} color={darkColors.syncing} />
          <Text style={styles.headerBadgeText}>{t('privacy.policy.encrypted')}</Text>
        </View>
      </View>

      <ScrollView
        testID="privacy-policy"
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        {/* Brand header */}
        <View style={styles.brand}>
          <Image
            source={appIcon}
            style={styles.brandLogo}
            resizeMode="contain"
            accessibilityLabel={t('common.appName')}
          />
          <Text style={styles.brandTitle}>{t('privacy.policy.brandName')}</Text>
          <Text style={styles.brandSubtitle}>
            {t('privacy.policy.subtitle', { version: POLICY_VERSION })}
          </Text>
          <View style={styles.compliancePill}>
            <View style={styles.complianceDot} />
            <Text style={styles.complianceText}>{t('privacy.policy.complianceBadge')}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Intro */}
        <Text style={styles.intro}>{t('privacy.policy.intro')}</Text>
        <Text style={styles.lastUpdated}>
          {t('privacy.policy.lastUpdated', { date: formatDate(POLICY_EFFECTIVE_DATE) })}
        </Text>

        {/* Accordion */}
        <View style={styles.accordion}>
          {SECTIONS.map((section) => {
            const open = openId === section.id;
            const titleKey = `${K}.${section.id}.title`;
            return (
              <View key={section.id} style={styles.card}>
                <Pressable
                  testID={`privacy-section-${section.id}`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  accessibilityLabel={t(titleKey)}
                  onPress={() => toggle(section.id)}
                  style={styles.cardHeader}
                >
                  <MaterialIcons name={section.icon} size={22} color={section.tint} />
                  <Text style={styles.cardTitle}>{t(titleKey)}</Text>
                  <MaterialIcons
                    name={open ? 'expand-less' : 'expand-more'}
                    size={24}
                    color={darkColors.muted}
                  />
                </Pressable>

                {open ? (
                  <View testID={`privacy-section-${section.id}-body`} style={styles.cardBody}>
                    {section.paragraphs.map((key) => (
                      <Text key={key} style={styles.bodyText}>
                        {t(key)}
                      </Text>
                    ))}

                    {section.bullets?.map((key) => (
                      <View key={key} style={styles.bulletRow}>
                        <Text style={styles.bulletDot}>•</Text>
                        <Text style={styles.bulletText}>{t(key)}</Text>
                      </View>
                    ))}

                    {section.quote ? (
                      <View style={styles.quote}>
                        <Text style={styles.quoteText}>{t(section.quote)}</Text>
                      </View>
                    ) : null}

                    {section.cards?.map((card) => (
                      <View key={card.key} style={styles.rightCard}>
                        <MaterialIcons name={card.icon} size={18} color={darkColors.primary} />
                        <Text style={styles.rightCardText}>{t(card.key)}</Text>
                      </View>
                    ))}

                    {section.controls ? (
                      <View style={styles.controlBlock}>
                        {section.controls.map((key) => (
                          <Text key={key} style={styles.controlLine}>
                            {t(key)}
                          </Text>
                        ))}
                      </View>
                    ) : null}

                    {section.footNotes?.map((key) => (
                      <Text key={key} style={styles.bodyText}>
                        {t(key)}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Footer — DPO contact + policy download */}
        <Text style={styles.footerLabel}>{t('privacy.policy.contact.label')}</Text>

        <Pressable
          testID="privacy-dpo-email"
          accessibilityRole="link"
          accessibilityState={{ disabled: DPO_EMAIL === null }}
          accessibilityLabel={t('privacy.policy.contact.label')}
          disabled={DPO_EMAIL === null}
          onPress={openDpoMail}
          style={[styles.secondaryButton, DPO_EMAIL === null && styles.buttonDisabled]}
        >
          <MaterialIcons
            name="mail"
            size={20}
            color={DPO_EMAIL === null ? darkColors.muted : darkColors.primary}
          />
          <Text
            style={[styles.secondaryButtonText, DPO_EMAIL === null && styles.buttonTextDisabled]}
          >
            {DPO_EMAIL ?? t('privacy.policy.contact.pending')}
          </Text>
        </Pressable>

        {/* Download is rendered disabled: there is no policy PDF asset and no backend endpoint to
            serve one (PO decision 2026-08-03 — keep the affordance, label it unavailable). */}
        <Pressable
          testID="privacy-download-pdf"
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          accessibilityLabel={`${t('privacy.policy.downloadPdf')} — ${t('privacy.policy.comingSoon')}`}
          disabled
          style={[styles.primaryButton, styles.buttonDisabled]}
        >
          <MaterialIcons name="download" size={20} color={darkColors.muted} />
          <Text style={[styles.primaryButtonText, styles.buttonTextDisabled]}>
            {t('privacy.policy.downloadPdf')}
          </Text>
          <View style={styles.comingSoonChip}>
            <Text style={styles.comingSoonText}>{t('privacy.policy.comingSoon')}</Text>
          </View>
        </Pressable>

        <Text style={styles.copyright}>
          {t('privacy.policy.copyright', { year: new Date().getFullYear() })}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },

  header: {
    height: touchTarget.listItem,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
    backgroundColor: darkColors.surface,
  },
  backButton: {
    width: touchTarget.iconButton,
    height: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Uppercased here rather than in the i18n value (PO 2026-08-03) so the stored string stays natural
  // and reusable. Safe for both shipped locales: Thai has no case, so `th` renders unchanged.
  headerTitle: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    textTransform: 'uppercase',
  },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs / 2 },
  headerBadgeText: {
    color: darkColors.muted,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },

  brand: { alignItems: 'center' },
  brandLogo: {
    width: 64,
    height: 64,
    marginBottom: spacing.md,
    // Glow ratified for this screen by PO decision 2026-08-03 (§32.7 pre-auth exception extended).
    ...Platform.select({
      ios: {
        shadowColor: darkColors.primary,
        shadowOpacity: 0.35,
        shadowRadius: 15,
        shadowOffset: { width: 0, height: 0 },
      },
      android: {},
      default: {},
    }),
  },
  // The brand is a wordmark — §32.7 sets it as CONSTRUCTION OS — so it renders uppercase, the same
  // way <VerifyingOverlay /> uppercases `common.appName` (PO 2026-08-03).
  brandTitle: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    lineHeight: typography.title.lineHeight,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  brandSubtitle: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
    textAlign: 'center',
    maxWidth: 280,
  },
  compliancePill: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: darkColors.surface,
  },
  complianceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: darkColors.success,
  },
  complianceText: {
    color: darkColors.success,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  divider: {
    height: 1,
    backgroundColor: darkColors.border,
    marginVertical: spacing.lg,
  },

  intro: {
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
  },
  lastUpdated: {
    marginTop: spacing.md,
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
  },

  accordion: { marginTop: spacing.xl, gap: spacing.sm },
  card: {
    borderWidth: 1,
    borderColor: darkColors.border,
    borderRadius: 12,
    backgroundColor: darkColors.surface,
    overflow: 'hidden',
  },
  cardHeader: {
    minHeight: touchTarget.listItem,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
  },
  cardBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  bodyText: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },
  bulletRow: { flexDirection: 'row', gap: spacing.xs },
  bulletDot: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },
  bulletText: {
    flex: 1,
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  quote: {
    borderLeftWidth: 2,
    borderLeftColor: darkColors.primary,
    paddingLeft: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: darkColors.elevated,
  },
  quoteText: {
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  rightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: 8,
    backgroundColor: darkColors.elevated,
  },
  rightCardText: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight * 1.15,
  },

  controlBlock: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: darkColors.elevated,
    padding: spacing.md,
    gap: spacing.xs / 2,
  },
  controlLine: {
    color: darkColors.cyan,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 18,
  },

  footerLabel: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    textAlign: 'center',
    color: darkColors.muted,
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  secondaryButton: {
    minHeight: touchTarget.formInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: darkColors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: darkColors.primary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
  },
  primaryButton: {
    marginTop: spacing.sm,
    minHeight: touchTarget.primaryButton,
    borderRadius: 12,
    backgroundColor: darkColors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  primaryButtonText: {
    color: darkColors.onPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
  },
  buttonDisabled: {
    backgroundColor: darkColors.elevated,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  buttonTextDisabled: { color: darkColors.muted },
  comingSoonChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: darkColors.surface,
  },
  comingSoonText: {
    color: darkColors.muted,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  copyright: {
    marginTop: spacing.xl,
    textAlign: 'center',
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
    lineHeight: typography.label.lineHeight,
  },
});
