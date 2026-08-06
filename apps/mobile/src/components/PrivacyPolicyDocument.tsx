// The Privacy Policy document body — the one copy of the policy, rendered at two routes.
//
// Why it is a component and not a screen: PO decision 2026-08-04 added a post-auth entry (drawer →
// PRIVACY POLICY) alongside the existing pre-auth one (login footer). A signed-in user must not be
// shown a different policy from the one they saw before signing up, so the copy, the version and the
// effective date live here once and both routes mount this. Duplicating it would also be the largest
// single clone in the app — ~470 lines — and would fail the jscpd ratchet (1.3%, .jscpd.json).
//
// The two routes differ in chrome and in one behaviour, both passed in rather than branched on here:
//   - `palette` — pre-auth pins dark (it is reached from the dark login screen and §32.7 lists it as
//     a dark surface); post-auth follows the user's theme, because it renders inside the (app) shell.
//   - `accent`  — §32.7 scopes `darkColors.cyan` to the auth entry screens, so the pre-auth route
//     passes it and the post-auth route passes its own primary. Nothing here reaches for the token
//     directly, which is what keeps that rule true.
//   - `onDataCollection` — post-auth, the Data Collection card is the entry point to the Transparency
//     Portal (PO decision 2026-08-04), so it navigates instead of expanding. Pre-auth it has nowhere
//     to go: every portal screen is behind AuthGate and one of them shows the user's own record.
//
// Content provenance is unchanged from the original screen and is documented at each section below.

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
import { MaterialIcons } from '@expo/vector-icons';
import { useI18n } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import type { Palette } from '../theme/palette';
import appIcon from '../../assets/icon.png';

// Effective version + date of the policy text below (PO decision 2026-08-03: v1.0.0, approved
// 2026-08-03). Bump BOTH whenever the policy copy in i18n changes — they are the document's identity,
// not decoration. Rendered through formatDate() so Thai shows the Buddhist era (QM-3).
export const POLICY_VERSION = '1.0.0';
export const POLICY_EFFECTIVE_DATE = '2026-08-03';

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

// The five accordion sections, in mockup order. `tint` is resolved from the palette at render so the
// same list serves both modes; every body string resolves through i18n (QM-3).
type Tint = 'accent' | 'primary' | 'success' | 'warning';

interface PolicySection {
  id: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  tint: Tint;
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
    tint: 'accent',
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
    tint: 'primary',
    paragraphs: [`${K}.usage.body`],
    quote: `${K}.usage.quote`,
    footNotes: [`${K}.usage.processors`, `${K}.usage.residency`],
  },
  {
    id: 'compliance',
    icon: 'gavel',
    tint: 'success',
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
    tint: 'warning',
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
    tint: 'accent',
    paragraphs: [`${K}.rights.body`, `${K}.rights.contact`],
  },
];

export function PrivacyPolicyDocument({
  palette,
  accent,
  paddingBottom,
  showBrandGlow,
  onDataCollection,
  testID,
}: {
  palette: Palette;
  /** Colour for the `accent`-tinted sections and the control block (see the §32.7 note above). */
  accent: string;
  paddingBottom: number;
  /** Pre-auth only — §32.7 allows the logo glow on the auth entry screens. */
  showBrandGlow?: boolean;
  /** Supplied post-auth: makes the Data Collection card open the Transparency Portal. */
  onDataCollection?: () => void;
  testID: string;
}): React.JSX.Element {
  const { t, formatDate } = useI18n();
  const styles = makeStyles(palette, accent, showBrandGlow === true);

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

  const tintOf = (tint: Tint): string =>
    tint === 'accent' ? accent : tint === 'primary' ? palette.primary : palette[tint];

  return (
    <ScrollView
      testID={testID}
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom }]}
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
          // The Data Collection card is the portal's entry point post-auth, so there it is a link,
          // not a disclosure — the portal covers this section in far more depth than the accordion.
          const links = section.id === 'collection' && onDataCollection !== undefined;
          const open = !links && openId === section.id;
          const titleKey = `${K}.${section.id}.title`;
          return (
            <View key={section.id} style={styles.card}>
              <Pressable
                testID={`privacy-section-${section.id}`}
                accessibilityRole="button"
                accessibilityState={links ? undefined : { expanded: open }}
                accessibilityLabel={t(titleKey)}
                onPress={links ? onDataCollection : () => toggle(section.id)}
                style={styles.cardHeader}
              >
                <MaterialIcons name={section.icon} size={22} color={tintOf(section.tint)} />
                <Text style={styles.cardTitle}>{t(titleKey)}</Text>
                {/* Disclosure indicator (PO decision 2026-08-04): a COLLAPSED section points RIGHT,
                    like the Data Collection link beside it, so the closed list reads as one uniform
                    column of "›" instead of mixing a link chevron with expander carets. Opening a
                    section turns it DOWN — the arrow keeps pointing at where the content is, which is
                    what preserves the open/closed signal the caret used to carry on its own. */}
                <MaterialIcons
                  name={links || !open ? 'chevron-right' : 'expand-more'}
                  size={24}
                  color={palette.muted}
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
                      <MaterialIcons name={card.icon} size={18} color={palette.primary} />
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
          color={DPO_EMAIL === null ? palette.muted : palette.primary}
        />
        <Text style={[styles.secondaryButtonText, DPO_EMAIL === null && styles.buttonTextDisabled]}>
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
        <MaterialIcons name="download" size={20} color={palette.muted} />
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
  );
}

const makeStyles = (p: Palette, accent: string, glow: boolean) =>
  StyleSheet.create({
    scroll: { backgroundColor: p.bg },
    content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },

    brand: { alignItems: 'center' },
    brandLogo: {
      width: 64,
      height: 64,
      marginBottom: spacing.md,
      // Glow ratified for the pre-auth screen by PO decision 2026-08-03 (§32.7 pre-auth exception).
      ...(glow
        ? Platform.select({
            ios: {
              shadowColor: p.primary,
              shadowOpacity: 0.35,
              shadowRadius: 15,
              shadowOffset: { width: 0, height: 0 },
            },
            android: {},
            default: {},
          })
        : {}),
    },
    // The brand is a wordmark — §32.7 sets it as CONSTRUCTION OS — so it renders uppercase, the same
    // way <VerifyingOverlay /> uppercases `common.appName` (PO 2026-08-03).
    brandTitle: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
      marginBottom: spacing.xs,
      textTransform: 'uppercase',
    },
    brandSubtitle: {
      color: p.muted,
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
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    complianceDot: { width: 8, height: 8, borderRadius: radius.md, backgroundColor: p.success },
    complianceText: {
      color: p.success,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    divider: { height: 1, backgroundColor: p.border, marginVertical: spacing.lg },

    intro: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
    },
    lastUpdated: {
      marginTop: spacing.md,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
    },

    accordion: { marginTop: spacing.xl, gap: spacing.sm },
    card: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.lg,
      backgroundColor: p.surface,
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
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    cardBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
    bodyText: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },
    bulletRow: { flexDirection: 'row', gap: spacing.xs },
    bulletDot: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },
    bulletText: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },

    quote: {
      borderLeftWidth: 2,
      borderLeftColor: p.primary,
      paddingLeft: spacing.sm,
      paddingVertical: spacing.xs,
      // `bg` for the same reason as `rightCard` below. This one was never invisible — the blue left
      // rule carries it — but its fill was inert, so a quote block and the card around it were the
      // same navy and the tint the design asked for never appeared.
      backgroundColor: p.bg,
    },
    quoteText: {
      color: p.text,
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
      borderRadius: radius.lg,
      // `bg`, not `elevated` — an inner panel nested in a `surface` card, exactly the relationship
      // TransparencyKit's sourceChip had. `elevated` #111827 inside `surface` #0F172A is a
      // 2-per-channel difference, so this panel had no edge of any kind: no border either, so each
      // right rendered as loose text on the parent card instead of its own plate. `bg` #020617 is
      // this palette's step below `surface`, which is the direction the mockups step an inner panel.
      backgroundColor: p.bg,
    },
    rightCardText: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },

    controlBlock: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.elevated,
      padding: spacing.md,
      gap: spacing.xs / 2,
    },
    controlLine: {
      color: accent,
      fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
      fontSize: 12,
      lineHeight: 18,
    },

    footerLabel: {
      marginTop: spacing.xl,
      marginBottom: spacing.md,
      textAlign: 'center',
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    secondaryButton: {
      minHeight: touchTarget.formInput,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    secondaryButtonText: {
      color: p.primary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    primaryButton: {
      marginTop: spacing.sm,
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    primaryButtonText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    buttonDisabled: { backgroundColor: p.elevated, borderWidth: 1, borderColor: p.border },
    buttonTextDisabled: { color: p.muted },
    comingSoonChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      // Outlined, for the same reason TransparencyKit's chip of this name is: the fill alone does not
      // carry it. This one sits inside the disabled download button, whose `buttonDisabled` fill is
      // `elevated` (#111827) against the chip's `surface` (#0F172A) — two navies 2-per-channel apart,
      // which is no chip at all. The kit's twin rendered as bare text on `07-erasure.png` until its
      // border went back on; this was the second copy, found by sweeping for filled plates with no
      // border rather than by waiting for it to show up in a capture.
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    comingSoonText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    copyright: {
      marginTop: spacing.xl,
      textAlign: 'center',
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
    },
  });
