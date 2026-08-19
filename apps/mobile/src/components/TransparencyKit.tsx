// Shared presentational pieces for the Transparency Portal screens
// (mockup/mobile/01_authen/05_privacy_policy/01_data_collection/, PO approval 2026-08-04).
//
// THOSE DRAWINGS WERE WITHDRAWN ON 2026-08-15 — one commit took that directory from 123 drawings to
// 9, and the whole `01_data_collection/**` set (~114 screens) went with it. Nothing here changes:
// ADR-085 makes a drawing authoritative for STYLE, not for existence, and the portal's screens and
// ADR-078/080/081/082/083/084 all stand. The 14 Android captures that documented them were retired
// on 2026-08-17, and capture-android-transparency.mjs was deleted so nothing recreates them — the
// screens outlived both their drawings and their screenshots. That leaves the kit below as the ONLY
// record of the layout those drawings specified, which is the reason its shapes are described in
// prose here rather than by pointing at a directory. The surviving `02_data_collection` is a
// single-screen folder, not the set — it is deliberately not cited as a replacement.
//
// Why a kit: the eight portal screens repeat the same handful of shapes — a status pill, a small
// caps section label, an icon card, a label/value row, a vertical flow step, a disabled action row.
// Written per screen that is eight near-identical StyleSheets, which is exactly the clone cluster
// `theme/screenStyles.ts` was created to stop and what the jscpd ratchet (1.3%, .jscpd.json) fails
// on. Every screen composes these instead.
//
// All components take PRE-TRANSLATED strings (same contract as <LoadingState />, §32.7): they hold
// no i18n keys, so a caller can pass a server value or a formatted string without the kit guessing.
//
// Palette: themed. Every piece reads `usePalette()`, so the kit renders in whichever mode the user
// is in — dark by default (PO decision 2026-08-04), light when they switch. StyleSheets here are
// built per render from the palette rather than at module load, which is what lets one component
// serve both modes without a second copy.

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { fontFamily, radius, spacing, typography, touchTarget } from '../theme/tokens';
import { usePalette } from '../theme/usePalette';
import type { Palette } from '../theme/palette';

/**
 * Whether a capability described on screen is actually running today.
 *
 * `planned` is not decoration — it is the honest label for a capability the specs define but the
 * platform does not yet do (IoT ingestion, PPE vision, geofencing). A privacy surface that
 * describes unbuilt processing as if it were live is the failure mode this whole portal has to
 * avoid, so the pill is mandatory on any row whose subject is not verifiable in the repo today.
 */
export type CapabilityStatus = 'live' | 'planned';

/**
 * Hard ceiling on a card's detail text, with an ellipsis past it (PO decision 2026-08-06).
 *
 * The mockups run one to two lines per card; the screens had drifted to four and five, which is
 * also what left the icon stranded at the top of a tall block. Copy is edited to fit — every card
 * body is under the 140-character budget `i18n/__tests__/cardBodyLength.spec.ts` enforces — so in
 * practice nothing truncates today.
 *
 * This is the guarantee behind that: a character budget is a proxy measured on English at the
 * default font size, and it stops being true under Thai, under a user's larger system font, or on a
 * narrow handset. `numberOfLines` holds regardless of all three.
 *
 * IT IS A SAFETY NET, NOT A LAYOUT TOOL. Truncating a transparency screen hides the very thing the
 * reader opened it for, and "…" gives them no way to recover it. If a card starts truncating in
 * practice, the copy is wrong, not the ceiling.
 */
const CARD_BODY_LINES = 3;

/**
 * The kit's palette and its sheet, resolved once per component.
 *
 * Nineteen components in this file opened with the same two lines. The `useMemo` is the point of it:
 * `makeStyles` builds a sheet of ~60 entries, and a transparency screen mounts a dozen of these, so
 * rebuilding on every render is work done a dozen times for a theme that changes almost never.
 */
/** An icon, a title, and whatever the caller puts inside — the shape of both titled panels. */
interface IconTitlePanelProps {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  children: ReactNode;
  testID?: string;
}

function useKitStyles(): { p: Palette; styles: ReturnType<typeof makeStyles> } {
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  return { p, styles };
}

export function StatusPill({
  status,
  label,
  testID,
}: {
  status: CapabilityStatus;
  /** Pre-translated, e.g. t('transparency.status.live'). */
  label: string;
  testID?: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  const live = status === 'live';
  return (
    <View
      testID={testID}
      style={[styles.pill, live ? styles.pillLive : styles.pillPlanned]}
      accessibilityRole="text"
    >
      <Text style={[styles.pillText, { color: live ? p.success : p.muted }]}>{label}</Text>
    </View>
  );
}

/** Small uppercase caption that opens a section ("Compliance breakdown", "Active inputs"). */
export function SectionLabel({ children }: { children: string }): React.JSX.Element {
  const { styles } = useKitStyles();
  return (
    <Text accessibilityRole="header" style={styles.sectionLabel}>
      {children}
    </Text>
  );
}

/** Lead-in paragraph under a screen title. */
export function Lede({ children }: { children: string }): React.JSX.Element {
  const { styles } = useKitStyles();
  return <Text style={styles.lede}>{children}</Text>;
}

/**
 * Icon + title + body card, optionally carrying a capability pill. The portal's default row: used
 * for data categories, collection methods and safeguards alike.
 *
 * `title` IS OPTIONAL, and omitting it is the right call for the lone card under a <SectionLabel />
 * that says the same thing. Eight such pairs shipped — the label and the card's own title were the
 * same i18n key — so the screens read "HOW LONG THIS IS KEPT / How long this is kept". The mockups
 * state a heading once (PO approval 2026-08-06). This is also what a screen reader wants: both the
 * section label and this title carry accessibilityRole="header", so the duplicate was announced
 * twice with nothing between them.
 */
export function InfoCard({
  icon,
  tint,
  title,
  body,
  status,
  statusLabel,
  testID,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  tint?: string;
  /** Omit when the enclosing <SectionLabel /> already says it — see the note above. */
  title?: string;
  body: string;
  status?: CapabilityStatus;
  statusLabel?: string;
  testID?: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  const pill = status && statusLabel ? <StatusPill status={status} label={statusLabel} /> : null;
  return (
    <View testID={testID} style={styles.card}>
      <View style={[styles.cardIcon, { backgroundColor: (tint ?? p.accent) + '14' }]}>
        <MaterialIcons name={icon} size={22} color={tint ?? p.accent} />
      </View>
      <View style={styles.cardBody}>
        {/* Kept when there is a pill but no title: the capability state must not vanish with the
            heading it happened to share a row with. */}
        {title || pill ? (
          <View style={styles.cardTitleRow}>
            {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
            {pill}
          </View>
        ) : null}
        <Text style={styles.cardText} numberOfLines={CARD_BODY_LINES} ellipsizeMode="tail">
          {body}
        </Text>
      </View>
    </View>
  );
}

/**
 * Label-over-value row for a concrete stored field. `note` carries provenance ("from your account"),
 * which matters on a transparency screen: the user should be able to tell a real stored value from
 * an explanation of one.
 */
export function FieldRow({
  label,
  value,
  note,
  testID,
}: {
  label: string;
  value: string;
  note?: string;
  testID?: string;
}): React.JSX.Element {
  const { styles } = useKitStyles();
  return (
    <View testID={testID} style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
      {note ? <Text style={styles.fieldNote}>{note}</Text> : null}
    </View>
  );
}

/** One node of a vertical pipeline diagram; `last` drops the trailing connector. */
export function FlowStep({
  icon,
  title,
  caption,
  last,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  caption: string;
  last?: boolean;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <View style={styles.flowRow}>
      <View style={styles.flowRail}>
        <View style={styles.flowNode}>
          <MaterialIcons name={icon} size={18} color={p.accent} />
        </View>
        {last ? null : <View style={styles.flowConnector} />}
      </View>
      <View style={styles.flowBody}>
        <Text style={styles.flowTitle}>{title}</Text>
        <Text style={styles.flowCaption}>{caption}</Text>
      </View>
    </View>
  );
}

/**
 * An action the portal shows but cannot perform yet — data export, erasure, preference changes.
 *
 * Rendered disabled with a "coming soon" chip rather than hidden (PO decision 2026-08-04). It is
 * deliberately NOT a Pressable: there is no endpoint behind any of these (PDPA-10/11/13/14 are all
 * OPEN in docs/compliance/pdpa-controls.md), and a control that looks tappable but silently does
 * nothing is worse than one that states its status.
 */
export function DisabledAction({
  icon,
  label,
  comingSoon,
  testID,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  /** Pre-translated chip text. */
  comingSoon: string;
  testID: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <View
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      accessibilityLabel={`${label} — ${comingSoon}`}
      style={styles.action}
    >
      <MaterialIcons name={icon} size={20} color={p.muted} />
      <Text style={styles.actionLabel}>{label}</Text>
      <View style={styles.comingSoonChip}>
        <Text style={styles.comingSoonText}>{comingSoon}</Text>
      </View>
    </View>
  );
}

/** Same shape as <InfoCard /> but tappable — the hub's rows into each category screen. */
export function NavCard({
  icon,
  tint,
  title,
  body,
  onPress,
  status,
  statusLabel,
  testID,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  tint?: string;
  title: string;
  body: string;
  onPress: () => void;
  status?: CapabilityStatus;
  statusLabel?: string;
  testID: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={statusLabel ? `${title} — ${statusLabel}` : title}
      onPress={onPress}
      style={styles.card}
    >
      <View style={[styles.cardIcon, { backgroundColor: (tint ?? p.accent) + '14' }]}>
        <MaterialIcons name={icon} size={22} color={tint ?? p.accent} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {status && statusLabel ? <StatusPill status={status} label={statusLabel} /> : null}
        </View>
        <Text style={styles.cardText} numberOfLines={CARD_BODY_LINES} ellipsizeMode="tail">
          {body}
        </Text>
      </View>
      {/* alignSelf:center — the card is a row whose tallest child is the two-to-three-line body, so
          the chevron would otherwise sit against the TOP edge (PO decision 2026-08-04: centre it). */}
      <MaterialIcons name="chevron-right" size={22} color={p.muted} style={styles.cardChevron} />
    </Pressable>
  );
}

/** Card wrapper used for the screen-opening summary tile. */
export function SummaryTile({ children }: { children: ReactNode }): React.JSX.Element {
  const { styles } = useKitStyles();
  return <View style={styles.summary}>{children}</View>;
}

// ─── Shapes the mockups use that the original kit had no equivalent for ──────
//
// Added 2026-08-05 after the product owner compared the shipped screens against
// mockup/mobile/01_authen/05_privacy_policy/01_data_collection/ (withdrawn 2026-08-15 — see the file
// header) and found the structure had been flattened into generic cards. That comparison is why
// these shapes exist, so it is recorded even though the drawings it was made against are gone.
// The mockups' LAYOUT is design input and is followed here; their
// factual claims are not (ADR-078/080/081/083/084 record which numbers were untrue and why), and
// their per-screen bottom navigation is deliberately NOT reproduced — DESIGN.md §5.5 fixes the
// bottom nav as the role's 4–5 item set, so a nav that changes per screen would break the spec.

/**
 * The panel a mockup screen opens with: small eyebrow, optional status badge, headline, body, and a
 * coloured bar down the left edge.
 *
 * The eyebrow and badge are separate props rather than free text because they carry different
 * weight: the eyebrow names what the panel is, the badge asserts a state. A caller that has nothing
 * verifiable to assert passes no badge, and the panel simply has none — which is what stopped the
 * mockups' "VERIFIED PROTECTED" from being reproduced as decoration.
 */
export function HeroCard({
  eyebrow,
  badge,
  title,
  body,
  icon,
  testID,
}: {
  eyebrow: string;
  badge?: string;
  title: string;
  body: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
  testID?: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <View testID={testID} style={styles.hero}>
      <View style={styles.heroAccent} />
      <View style={styles.heroBody}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroEyebrowRow}>
            {icon ? <MaterialIcons name={icon} size={14} color={p.accent} /> : null}
            <Text style={styles.heroEyebrow}>{eyebrow}</Text>
          </View>
          {badge ? (
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroText} numberOfLines={CARD_BODY_LINES} ellipsizeMode="tail">
          {body}
        </Text>
      </View>
    </View>
  );
}

/** A section label with a right-aligned tag, as `IDENTITY SCHEMA … ENCRYPTED_AT_REST` is drawn. */
export function SectionLabelRow({
  label,
  tag,
}: {
  label: string;
  tag?: string;
}): React.JSX.Element {
  const { styles } = useKitStyles();
  return (
    <View style={styles.sectionRow}>
      <Text accessibilityRole="header" style={[styles.sectionLabel, styles.sectionRowLabel]}>
        {label}
      </Text>
      {tag ? <Text style={styles.sectionTag}>{tag}</Text> : null}
    </View>
  );
}

/**
 * A stored value shown as its own card, with an optional provenance chip.
 *
 * The chip is what makes this different from <FieldRow />: on a transparency screen the reader's
 * next question after "what do you hold" is "where did it come from", and answering it inline is
 * the difference between disclosure and assertion.
 */
export function FieldCard({
  label,
  value,
  source,
  verified,
  testID,
}: {
  label: string;
  value: string;
  /** Pre-translated provenance, e.g. "From your account". */
  source?: string;
  /** Shows a tick — use only where the platform has actually verified the value. */
  verified?: boolean;
  testID?: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <View testID={testID} style={styles.fieldCard}>
      <View style={styles.fieldCardBody}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
      {source ? (
        <View style={styles.sourceChip}>
          <Text style={styles.sourceChipText}>{source}</Text>
        </View>
      ) : null}
      {verified ? <MaterialIcons name="check-circle" size={20} color={p.success} /> : null}
    </View>
  );
}

/** Two small cards side by side (PROFILE IMAGE ⟷ PROFESSIONAL ROLE in the identity mockup). */
export function TwoUp({ children }: { children: ReactNode }): React.JSX.Element {
  const { styles } = useKitStyles();
  return <View style={styles.twoUp}>{children}</View>;
}

/**
 * One cell of a `TwoUp`: a 10px uppercase label over a short value carried by a leading glyph.
 *
 * The glyph is the point. `01_00_identity_contact_details:208-227` draws these two cells as a round
 * 40px portrait beside "User Upload" and a 16px `badge` beside "Site Supervisor" — the value is
 * two or three words, and the glyph does the work of saying what kind of thing it is. The first
 * implementation dropped the glyph and let the value run to two wrapped lines instead, which is
 * what made the pair read as a wall of text rather than a summary.
 *
 * `avatar` renders the photo when there is one and the initials when there is not, so "no photo" is
 * still a filled circle rather than a gap.
 */
export function TwoUpCell({
  label,
  value,
  icon,
  avatar,
  testID,
}: {
  label: string;
  /** Two or three words. Anything longer belongs in a FieldCard. */
  value: string;
  /** Small leading icon, mockup 16px. Mutually exclusive with `avatar`. */
  icon?: keyof typeof MaterialIcons.glyphMap;
  /** Round 40px avatar. `uri` when the person has a photo, `initials` as the fallback. */
  avatar?: { uri?: string | null; initials: string };
  testID?: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <View testID={testID} style={styles.twoUpCell}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.twoUpValueRow}>
        {avatar ? (
          avatar.uri ? (
            <Image source={{ uri: avatar.uri }} style={styles.twoUpAvatar} />
          ) : (
            <View style={[styles.twoUpAvatar, styles.twoUpAvatarFallback]}>
              <Text style={styles.twoUpAvatarText}>{avatar.initials}</Text>
            </View>
          )
        ) : null}
        {icon ? <MaterialIcons name={icon} size={16} color={p.accent} /> : null}
        <Text style={styles.cellValue}>{value}</Text>
      </View>
    </View>
  );
}

/**
 * A full-width action row: icon, title, chevron — and deliberately NO body.
 *
 * `01_00_identity_contact_details:278-291` draws the "Manage Data" actions this way, and the
 * omission is the design: by the time a reader reaches the bottom of a transparency screen they
 * have been told what the data is and who can see it, so an explanatory paragraph under "Request
 * Identity Export" restates the section above it. NavCard (icon tile + title + body + chevron) is
 * for entering a subject; this is for acting on the one already being read.
 */
export function ActionRow({
  icon,
  title,
  onPress,
  testID,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  onPress: () => void;
  testID: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={styles.actionRow}
    >
      <View style={styles.actionRowLeft}>
        <MaterialIcons name={icon} size={22} color={p.accent} />
        <Text style={styles.actionRowTitle}>{title}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={22} color={p.muted} />
    </Pressable>
  );
}

/** The accented "Usage Purpose" panel — a titled card with a left bar and icon rows inside it. */
export function AccentCard({
  icon,
  title,
  children,
  testID,
}: IconTitlePanelProps): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <View testID={testID} style={styles.accent}>
      <View style={styles.accentBar} />
      <View style={styles.accentBody}>
        <View style={styles.accentTitleRow}>
          <MaterialIcons name={icon} size={18} color={p.accent} />
          <Text style={styles.accentTitle}>{title}</Text>
        </View>
        {children}
      </View>
    </View>
  );
}

/** One icon + title + body row inside an <AccentCard />. */
export function AccentRow({
  icon,
  title,
  body,
  tint,
  testID,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  body: string;
  tint?: string;
  testID?: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <View testID={testID} style={styles.accentRow}>
      <MaterialIcons name={icon} size={18} color={tint ?? p.muted} style={styles.accentRowIcon} />
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardText} numberOfLines={CARD_BODY_LINES} ellipsizeMode="tail">
          {body}
        </Text>
      </View>
    </View>
  );
}

/** The dashed, centred panel the mockups close a screen with (Global Retention Policy). */
export function DashedPanel({
  icon,
  title,
  children,
  testID,
}: IconTitlePanelProps): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <View testID={testID} style={styles.dashed}>
      <MaterialIcons name={icon} size={28} color={p.muted} />
      <Text style={styles.dashedTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * The underlined destructive link the mockups end with ("REQUEST DATA DELETION").
 *
 * A real Pressable with a real destination — the mockup drew it as a button with nothing behind it,
 * and a control that looks tappable and does nothing is the failure this portal exists to avoid.
 */
export function DangerLink({
  label,
  onPress,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
  testID: string;
}): React.JSX.Element {
  const { p, styles } = useKitStyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.dangerLink}
    >
      {icon ? <MaterialIcons name={icon} size={16} color={p.danger} /> : null}
      <Text style={styles.dangerLinkText}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    pill: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      // NOT a capsule: the mockups override `rounded-full` to 0.75rem = 12px, so every badge there
      // is a rounded rectangle (§32.7 Mobile Border Radius).
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    pillLive: { backgroundColor: p.success + '14', borderColor: p.success + '55' },
    pillPlanned: { backgroundColor: p.border, borderColor: p.muted + '55' },
    pillText: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },

    sectionLabel: {
      marginTop: spacing.md,
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    lede: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },

    summary: {
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.lg,
      backgroundColor: p.elevated,
      padding: spacing.md,
      gap: spacing.xs,
    },

    card: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    cardIcon: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      // alignSelf:center — same reason the chevron already carries it, applied to the other end of
      // the row (PO decision 2026-08-06). The card's height is set by the two-to-four-line body, so
      // a 44px tile with no cross-axis alignment sits against the TOP edge and reads as stranded.
      //
      // THIS OVERRIDES THE MOCKUPS, deliberately: every icon card in
      // `01_data_collection/*/code.html` used `flex items-start` (that set was withdrawn on
      // 2026-08-15 — see the file header; this remains why the override exists). That worked there because the
      // mockup bodies are one or two lines of placeholder copy, so top and centre are nearly the
      // same pixel. The real screens carry longer, corrected copy — the gap the mockup never had.
      alignSelf: 'center',
    },
    cardBody: { flex: 1, gap: 2 },
    cardChevron: { alignSelf: 'center' },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardTitle: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
    },
    cardText: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },

    field: {
      padding: spacing.sm,
      borderRadius: radius.md,
      // `elevated`, not `border`. This row used the BORDER colour as a fill — harmless while that
      // token was a translucent slate, but it turned visibly grey the moment `--cos-dark-outline`
      // (#46464C) landed, so these rows read as a different material from every card around them.
      // The mockup puts them one step above the card surface (`bg-surface-container-high` +
      // `border border-outline-variant`, `01_00_identity_contact_details:186`), which is what
      // `elevated` (#111827) is — still navy, just raised.
      backgroundColor: p.elevated,
      borderWidth: 1,
      borderColor: p.border,
      gap: 2,
    },
    fieldLabel: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    fieldValue: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
    },
    fieldNote: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    flowRow: { flexDirection: 'row', gap: spacing.sm },
    flowRail: { alignItems: 'center', width: 36 },
    flowNode: {
      width: 36,
      height: 36,
      borderRadius: 999, // circle on a 36px node — a shape, not a scale step
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flowConnector: { flex: 1, width: 2, backgroundColor: p.border, minHeight: spacing.md },
    flowBody: { flex: 1, paddingBottom: spacing.md, gap: 2 },
    flowTitle: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
    },
    flowCaption: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    action: {
      minHeight: touchTarget.formInput,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.elevated,
    },
    actionLabel: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
    },
    comingSoonChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      // Status chip — same family as StatusPill, so the same shape (§32.7: pills and badges take xl)
      // AND the same outline. Fill alone does not carry it: this chip sits on the `action` row, whose
      // own background is `elevated` (#111827) against the chip's `surface` (#0F172A). Two navies
      // that close read as no chip at all — `07-erasure.png` showed COMING SOON as bare text until
      // the border went back on. StatusPill has always had one; this was the piece that did not.
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

    // ── mockup shapes ──
    hero: {
      flexDirection: 'row',
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      overflow: 'hidden',
    },
    heroAccent: { width: 4, backgroundColor: p.accent },
    heroBody: { flex: 1, padding: spacing.md, gap: spacing.xs },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    heroEyebrowRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    heroEyebrow: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    heroBadge: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 3,
      // xl, matching StatusPill — this badge and the "IN USE" pills further down the same screen are
      // the same kind of object, and §32.7 already said badges take xl. The hub mockup agrees
      // (`00_data_collection_detail:173` = `rounded-full` = 12px under its own override).
      //
      // The identity mockup does NOT: `01_00_identity_contact_details:161` gives its schema tag a
      // bare `rounded` (2px). One kit component serves both slots, and shipping two 10px uppercase
      // badges with different corners on adjacent screens is the inconsistency being corrected here,
      // so the hub's shape wins for both (PO decision 2026-08-06).
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.success + '55',
      backgroundColor: p.success + '14',
    },
    heroBadgeText: {
      color: p.success,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    heroTitle: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    heroText: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },

    sectionRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs },
    sectionRowLabel: { flex: 1 },
    sectionTag: {
      marginTop: spacing.md,
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.8,
    },

    fieldCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    fieldCardBody: { flex: 1, gap: 2 },
    sourceChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 3,
      borderRadius: radius.sm,
      // `bg`, not `elevated`. This chip is the one plate in the kit with NO border, so its fill is the
      // only thing that draws it — and `elevated` #111827 against the card's `surface` #0F172A is a
      // 2-per-channel difference, i.e. nothing. The provenance tag rendered as bare grey text on
      // 01-identity.png, exactly the failure the COMING SOON chip had.
      //
      // The mockup steps the chip AWAY from the card rather than up from it: the field card is
      // `bg-surface-container-high` #1b2b3f and the tag `bg-surface-container` #102034 — a recess, not
      // a raise. `bg` #020617 is this palette's step below `surface`, so it reproduces that reading;
      // `elevated` cannot, whatever it is named for.
      backgroundColor: p.bg,
    },
    sourceChipText: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
    },

    twoUp: { flexDirection: 'row', gap: spacing.sm },
    twoUpCell: {
      flex: 1,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      gap: spacing.xs,
    },
    twoUpValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cellValue: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
    },
    twoUpAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20, // a circle — half the width, off the radius scale (§32.7)
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    twoUpAvatarFallback: { alignItems: 'center', justifyContent: 'center' },
    twoUpAvatarText: {
      color: p.muted,
      fontFamily: fontFamily.bold,
      fontSize: typography.caption.fontSize,
    },

    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: touchTarget.primaryButton,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    actionRowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
    actionRowTitle: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.body.fontSize,
    },

    accent: {
      flexDirection: 'row',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      overflow: 'hidden',
    },
    accentBar: { width: 3, backgroundColor: p.accent },
    accentBody: { flex: 1, padding: spacing.sm, gap: spacing.sm },
    accentTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    accentTitle: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    accentRow: { flexDirection: 'row', gap: spacing.sm },
    accentRowIcon: { marginTop: 2 },

    dashed: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: radius.xxl,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: p.muted + '66',
      alignItems: 'center',
      gap: spacing.xs,
    },
    dashedTitle: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      textAlign: 'center',
    },

    dangerLink: {
      minHeight: touchTarget.iconButton,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    dangerLinkText: {
      color: p.danger,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      textDecorationLine: 'underline',
    },
  });
