// Help Chat — the content BOTH chat routes render.
//
// DRAWING: mockup/mobile/01_authen/05_get_help/03_help_chat. Drawn complete, exactly as the mockup
// draws it (product-owner decision 2026-09-10, "วาด UI ให้ครบตามแบบ mockup").
//
// A child of the Support Centre on both sides of login, reached by the chevron the drawing puts on
// its Help Chat card. The chat is open pre-auth AND post-auth (ADR-093 decision 3), which is why
// there are two routes and one document — the shape `SupportCenterDocument` and
// `PrivacyPolicyDocument` already use.
//
// ── COMING SOON: WHAT IS INERT, AND WHAT HAPPENS WHEN IT IS PRESSED ────────────────────────────
//
// Nothing on this screen has a process behind it yet. `platform.support_tickets` and
// `platform.support_messages` exist as tables (migration `20260818000001_support_desk_and_help_chat`)
// but no endpoint reads or writes them — there is no `backend/src/modules/support/`, and none of the
// backend's 25 controller prefixes is support, chat or ticket (measured 2026-09-10).
//
// So every ACTION raises `useComingSoon()` when it is pressed (product-owner decision 2026-09-10):
// the three quick-action chips, attach, camera and send. The composer field itself accepts typing —
// a text box that refuses keystrokes reads as broken rather than unbuilt — and the message is
// discarded on send with the alert saying so.
//
// The screen says NOTHING about this until something is pressed. No "coming soon" banner, no
// "unavailable" note, no disabled styling: the drawing is rendered as drawn, and the alert is the
// only place the state is stated.
//
// ── WHAT THE THREAD IS ─────────────────────────────────────────────────────────────────────────
//
// The four turns are the drawing's own copy, registered as `HELP_CHAT_THREAD` and drawn from the
// i18n catalogues (ADR-099). The ticket number is `HELP_CHAT_TICKET` — `support_tickets.reference`
// is the column that will supply it.
//
// ADR-093 §3 argues against two things this screen draws — the `AGENT ONLINE` dot, because there is
// no agent presence service and no `SUPPORT_AGENT` role in §6.2, and the opening turn's "I'm
// Terminal 01, your technical support agent", because ADR-081 forbids labelling an AI turn as a
// human. The product owner's 2026-09-10 instruction is to draw the mockup, and it supersedes both
// for this screen. The ADR stays on disk with its reasoning intact for whoever builds the endpoints;
// this comment is the record that the difference is a decision rather than an oversight.

import { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../i18n';
import { useComingSoon } from './useComingSoon';
import { HELP_CHAT_THREAD, HELP_CHAT_TICKET } from '../lib/mockupFigures';
import { fontFamily, plateRadius, radius, spacing, touchTarget, typography } from '../theme/tokens';
import type { Palette } from '../theme/usePalette';

/** The agent avatar beside every agent bubble. */
const AVATAR = 32;

export function HelpChatDocument({
  testID = 'help-chat',
  palette,
  paddingBottom,
}: {
  testID?: string;
  palette: Palette;
  paddingBottom: number;
}): React.JSX.Element {
  const t = useT();
  const soon = useComingSoon();
  const s = useMemo(() => makeStyles(palette), [palette]);
  // The field accepts typing. Send discards it with the alert — see the note at the head.
  const [draft, setDraft] = useState('');

  return (
    <View testID={testID} style={s.root}>
      <ScrollView
        testID="help-chat-thread"
        contentContainerStyle={s.thread}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Secure session ──────────────────────────────────────────────────────────────────── */}
        <View style={s.systemRow}>
          <View testID="help-chat-session" style={s.sessionPill}>
            <MaterialIcons name="lock" size={14} color={palette.accent} />
            <Text style={s.sessionText} numberOfLines={1}>
              {t('helpChat.secureSession', { ticket: HELP_CHAT_TICKET.value })}
            </Text>
          </View>
        </View>

        {/* ── Day divider ─────────────────────────────────────────────────────────────────────── */}
        <View style={s.systemRow}>
          <Text style={s.dayDivider}>{HELP_CHAT_THREAD.value.day}</Text>
        </View>

        {/* ── The agent's opening turn ────────────────────────────────────────────────────────── */}
        <AgentBubble
          testID="help-chat-agent-1"
          body={<Text style={s.bubbleText}>{t('helpChat.agentOpening')}</Text>}
          stamp={t('helpChat.stampAi', { time: HELP_CHAT_THREAD.value.opening })}
          palette={palette}
          s={s}
        />

        {/* ── The user's turn ─────────────────────────────────────────────────────────────────── */}
        <View testID="help-chat-user-1" style={s.userRow}>
          <View style={s.userColumn}>
            <View style={s.userBubble}>
              <Text style={s.userText}>{t('helpChat.userFirst')}</Text>
            </View>
            <Text style={s.stampRight}>
              {t('helpChat.stampRead', { time: HELP_CHAT_THREAD.value.question })}
            </Text>
          </View>
        </View>

        {/* ── The agent's reply — two paragraphs behind a leading accent strip ─────────────────── */}
        <AgentBubble
          testID="help-chat-agent-2"
          accent
          body={
            <>
              <Text style={[s.bubbleText, s.bubbleParagraph]}>{t('helpChat.agentReplyOne')}</Text>
              <Text style={s.bubbleText}>{t('helpChat.agentReplyTwo')}</Text>
            </>
          }
          stamp={t('helpChat.stampAi', { time: HELP_CHAT_THREAD.value.reply })}
          palette={palette}
          s={s}
        />
      </ScrollView>

      {/* ── Quick actions ────────────────────────────────────────────────────────────────────── */}
      <View style={s.quickBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.quickRow}
        >
          {(
            [
              ['help-chat-quick-diagnostic', 'helpChat.quickDiagnostic'],
              ['help-chat-quick-sync', 'helpChat.quickSyncGuide'],
              ['help-chat-quick-hardware', 'helpChat.quickHardware'],
            ] as const
          ).map(([id, key]) => (
            <Pressable
              key={id}
              testID={id}
              accessibilityRole="button"
              accessibilityLabel={t(key)}
              onPress={() => soon(key)}
              style={s.quickChip}
            >
              <Text style={s.quickChipText}>{t(key)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── Composer ─────────────────────────────────────────────────────────────────────────── */}
      <View style={[s.composer, { paddingBottom: paddingBottom + spacing.sm }]}>
        <Pressable
          testID="help-chat-attach"
          accessibilityRole="button"
          accessibilityLabel={t('helpChat.attach')}
          onPress={() => soon('helpChat.attach')}
          style={s.composerIcon}
        >
          <MaterialIcons name="attach-file" size={24} color={palette.muted} />
        </Pressable>

        <View style={s.fieldWrap}>
          <TextInput
            testID="help-chat-input"
            value={draft}
            onChangeText={setDraft}
            placeholder={t('helpChat.composerPlaceholder')}
            placeholderTextColor={palette.muted}
            accessibilityLabel={t('helpChat.composerPlaceholder')}
            multiline
            style={s.field}
          />
          {/* The drawing puts the camera INSIDE the field, at its trailing edge. */}
          <Pressable
            testID="help-chat-camera"
            accessibilityRole="button"
            accessibilityLabel={t('helpChat.camera')}
            onPress={() => soon('helpChat.camera')}
            style={s.fieldCamera}
          >
            <MaterialIcons name="photo-camera" size={20} color={palette.muted} />
          </Pressable>
        </View>

        <Pressable
          testID="help-chat-send"
          accessibilityRole="button"
          accessibilityLabel={t('helpChat.send')}
          onPress={() => {
            soon('helpChat.send');
            setDraft('');
          }}
          style={s.send}
        >
          <MaterialIcons name="send" size={20} color={palette.onPrimary} />
        </Pressable>
      </View>
    </View>
  );
}

/** An agent turn — avatar, bubble, timestamp. `accent` adds the drawing's leading strip. */
function AgentBubble({
  testID,
  body,
  stamp,
  accent = false,
  palette,
  s,
}: {
  testID: string;
  body: React.ReactNode;
  stamp: string;
  accent?: boolean;
  palette: Palette;
  s: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View testID={testID} style={s.agentRow}>
      <View style={s.avatar}>
        <MaterialIcons name="support-agent" size={18} color={palette.accent} />
      </View>
      <View style={s.agentColumn}>
        <View style={[s.agentBubble, accent && s.agentBubbleAccent]}>
          {accent ? <View style={s.accentStrip} /> : null}
          {body}
        </View>
        <Text style={s.stampLeft}>{stamp}</Text>
      </View>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },

    thread: { padding: spacing.md, gap: spacing.md },

    systemRow: { alignItems: 'center' },
    sessionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      // `xl`, not the drawing's `rounded-DEFAULT`. §32.7's radius ruling is explicit that this is a
      // PLATFORM decision rather than a reading of the mockups — "EVERY status pill / badge takes
      // xl 12px — one token, no exceptions", and the mockups are recorded there as disagreeing.
      // `badgeRadius.spec.ts` holds it. On a 26px chip the two are within a pixel of each other.
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSoft,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    sessionText: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    dayDivider: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
      letterSpacing: 0.4,
    },

    // ── Agent side ────────────────────────────────────────────────────────────────────────────
    agentRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.xs,
      maxWidth: '85%',
    },
    avatar: {
      width: AVATAR,
      height: AVATAR,
      borderRadius: plateRadius(AVATAR),
      borderWidth: 1,
      borderColor: `${p.accent}80`,
      backgroundColor: p.surfaceSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    agentColumn: { flex: 1, gap: 4 },
    agentBubble: {
      borderRadius: radius.xl,
      // The drawing squares the corner nearest the avatar, so the bubble points at its speaker.
      borderBottomLeftRadius: radius.sm,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      padding: spacing.sm,
      overflow: 'hidden',
    },
    agentBubbleAccent: { borderColor: `${p.accent}80`, paddingLeft: spacing.sm + 4 },
    accentStrip: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 4,
      backgroundColor: p.accent,
    },
    bubbleText: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.fontSize * 1.45,
    },
    bubbleParagraph: { marginBottom: spacing.xs },
    stampLeft: {
      marginLeft: 4,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
      letterSpacing: 0.3,
    },

    // ── User side ─────────────────────────────────────────────────────────────────────────────
    userRow: { flexDirection: 'row', justifyContent: 'flex-end' },
    userColumn: { maxWidth: '85%', alignItems: 'flex-end', gap: 4 },
    userBubble: {
      borderRadius: radius.xl,
      borderBottomRightRadius: radius.sm,
      backgroundColor: p.primary,
      padding: spacing.sm,
    },
    userText: {
      color: p.onPrimary,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.fontSize * 1.45,
    },
    stampRight: {
      marginRight: 4,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
      letterSpacing: 0.3,
    },

    // ── Quick actions ─────────────────────────────────────────────────────────────────────────
    quickBar: { borderTopWidth: 1, borderTopColor: p.border, backgroundColor: p.surfaceSunk },
    quickRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
    quickChip: {
      minHeight: touchTarget.secondaryButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSoft,
    },
    quickChipText: { color: p.text, fontFamily: fontFamily.medium, fontSize: 11 },

    // ── Composer ──────────────────────────────────────────────────────────────────────────────
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: p.border,
      backgroundColor: p.surface,
    },
    composerIcon: {
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fieldWrap: { flex: 1, justifyContent: 'center' },
    field: {
      minHeight: touchTarget.iconButton,
      maxHeight: 120,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSoft,
      paddingLeft: spacing.md,
      paddingRight: 44,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    fieldCamera: {
      position: 'absolute',
      right: 4,
      bottom: 4,
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    send: {
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      borderRadius: plateRadius(touchTarget.iconButton),
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
