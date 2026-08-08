// Team directory — the project's crew as a contact list.
// Implements mockup/mobile/05_site_worker/04_directory/01_worker_list ("Team Directory").
//
// A pushed child of Home (breadcrumb + back chevron), NOT a bottom tab: the 2026-08-08 mockup
// restructure drew Directory in the bar, but its five drawings carry four different bars between
// them and §32.7 allows exactly four items — the product owner kept Home | Issues | Reports |
// Safety, so this is reached from the navigation drawer instead.
//
// ONE request per project, not one per worker: GET /projects/{id}/workforce/directory is a server-
// side join over project_workforce + workers + today's attendance (added 2026-08-08). A field worker
// opens this on site 3G, and a card-by-card fetch would be N+1 on the slowest link the product has
// (§17.7).
//
// NOT OFFLINE-CACHED, deliberately. §17.4 lists what a field worker may read with no signal —
// tasks, reports, issues, checklists, attendance — and a colleague directory is not on it. More to
// the point, the value this screen adds over a phone's own contacts is `on_site`, which is only
// true as of the moment it was fetched; a cached copy would state that someone is standing on the
// site when the reader has no way to know how old the claim is. Offline it shows the error state.
//
// TWO ACTIONS PER CARD, as the mockup draws. Calling is REAL — `tel:` through Linking, disabled
// when the worker has no `contact_phone`, which the column allows. CHAT is drawn but reports that it
// is unavailable (PO decision 2026-08-09, the treatment already used for START SCAN and ADJUST
// SCHEDULE): the product has no chat — no route, no backend module, no API spec — so the button
// says so rather than opening nothing or pretending to send.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { get } from '../../api/client';
import { ProjectPicker } from '../../components/ProjectPicker';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { initialsOf as initials } from '../../lib/initials';
import { matchesDirectoryQuery } from '../../lib/directoryFilter';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark } from '../../theme/usePalette';

/** One card — the DirectoryEntry schema of workforce.openapi.yaml. */
interface DirectoryEntry {
  worker_id: string;
  full_name: string;
  trade_type: string;
  contact_phone?: string | null;
  role_on_project?: string | null;
  on_site: boolean;
}

export default function DirectoryScreen() {
  const [projectId, setProjectId] = useState('');
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  // Starts false: nothing is fetched before a project is chosen, and a loader shown first would
  // spin forever on a device whose project cache is still empty.
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(), []);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        const res = await get<DirectoryEntry[] | { items?: DirectoryEntry[] }>(
          `/projects/${encodeURIComponent(projectId)}/workforce/directory`,
        );
        setEntries(Array.isArray(res) ? res : (res.items ?? []));
      } catch {
        // Offline or server error — see the header note on why nothing is cached.
        setEntries([]);
        setFailed(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  const visible = useMemo(
    () => entries.filter((e) => matchesDirectoryQuery(e, query)),
    [entries, query],
  );
  const onSite = useMemo(() => entries.filter((e) => e.on_site).length, [entries]);

  const call = useCallback((phone: string) => {
    void Linking.openURL(`tel:${phone}`);
  }, []);

  return (
    <ScrollView
      testID="directory-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />

      {/* Search — the mockup's rounded field with a leading glyph. */}
      <View style={[styles.search, { backgroundColor: p.surface, borderColor: p.border }]}>
        <MaterialIcons name="search" size={20} color={p.muted} />
        <TextInput
          testID="directory-search"
          style={[styles.searchInput, { color: p.text }]}
          placeholder={t('directory.searchPlaceholder')}
          placeholderTextColor={p.muted}
          value={query}
          onChangeText={setQuery}
          accessibilityLabel={t('directory.searchPlaceholder')}
        />
      </View>

      {/* A real count, never a fixed figure: how many of the crew are on site right now. */}
      {entries.length > 0 ? (
        <Text testID="directory-count" style={[styles.count, { color: p.muted }]}>
          {t('directory.onSiteCount', { onSite, total: entries.length })}
        </Text>
      ) : null}

      <LoadingBoundary loading={loading} variant="list" theme={isDark ? 'dark' : 'light'}>
        {failed ? (
          <Text testID="directory-error" style={[styles.empty, { color: p.muted }]}>
            {t('directory.unavailable')}
          </Text>
        ) : visible.length === 0 ? (
          <Text testID="directory-empty" style={[styles.empty, { color: p.muted }]}>
            {projectId === '' ? t('directory.pickProject') : t('directory.empty')}
          </Text>
        ) : (
          visible.map((entry) => (
            <View
              key={entry.worker_id}
              testID={`directory-card-${entry.worker_id}`}
              style={[
                styles.card,
                {
                  backgroundColor: p.surface,
                  borderColor: p.border,
                  // The mockup's left strip: green while they are on site, neutral otherwise.
                  borderLeftColor: entry.on_site ? p.success : p.border,
                },
              ]}
            >
              {/* Initials, not <Avatar /> — that component renders the SIGNED-IN user (it reads
                  displayName from the auth store), and `workforce.workers` has no photo column, so
                  there is no colleague photo to show even if it did. */}
              {/* The avatar is a filled, outlined disc — on the dark palette `elevated` sits so close
                  to `surface` that an unbordered circle vanished and the initials read as loose
                  letters beside the name (PO 2026-08-09). A person glyph stands in when the name
                  yields no initials at all, so the shape is never empty. */}
              <View style={[styles.avatar, { backgroundColor: p.elevated, borderColor: p.border }]}>
                {initials(entry.full_name) === '' ? (
                  <MaterialIcons name="person" size={24} color={p.muted} />
                ) : (
                  <Text style={[styles.avatarText, { color: p.text }]}>
                    {initials(entry.full_name)}
                  </Text>
                )}
              </View>
              <View style={styles.cardBody}>
                <Text style={[styles.name, { color: p.text }]} numberOfLines={1}>
                  {entry.full_name}
                </Text>
                {/* The job on THIS project when the allocation names one, else the trade they were
                    hired under — the same person can be a foreman here and a fitter elsewhere. */}
                <Text style={[styles.role, { color: p.muted }]} numberOfLines={1}>
                  {entry.role_on_project ?? entry.trade_type}
                </Text>
                <Text
                  style={[styles.status, { color: entry.on_site ? p.success : p.muted }]}
                  numberOfLines={1}
                >
                  {entry.on_site ? t('directory.onSite') : t('directory.offSite')}
                </Text>
              </View>
              <TouchableOpacity
                testID={`directory-chat-${entry.worker_id}`}
                onPress={() => Alert.alert(t('directory.chat'), t('common.comingSoon'))}
                accessibilityRole="button"
                accessibilityLabel={t('directory.chatWith', { name: entry.full_name })}
                style={styles.callButton}
              >
                <MaterialIcons name="chat-bubble-outline" size={22} color={p.muted} />
              </TouchableOpacity>
              <TouchableOpacity
                testID={`directory-call-${entry.worker_id}`}
                onPress={() => entry.contact_phone && call(entry.contact_phone)}
                disabled={!entry.contact_phone}
                accessibilityRole="button"
                accessibilityLabel={t('directory.call', { name: entry.full_name })}
                accessibilityState={{ disabled: !entry.contact_phone }}
                style={[styles.callButton, !entry.contact_phone && styles.callDisabled]}
              >
                <MaterialIcons
                  name="call"
                  size={22}
                  color={entry.contact_phone ? p.accent : p.muted}
                />
              </TouchableOpacity>
            </View>
          ))
        )}
      </LoadingBoundary>
    </ScrollView>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.formInput,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
    },
    searchInput: {
      flex: 1,
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
      padding: 0,
    },
    count: { fontSize: typography.caption.fontSize, fontFamily: fontFamily.medium },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderLeftWidth: 4,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 999, // circle — half the width, not a step on the radius scale (§32.7)
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: typography.body.fontSize, fontFamily: fontFamily.semibold },
    cardBody: { flex: 1, gap: 2 },
    name: { fontSize: typography.body.fontSize, fontFamily: fontFamily.semibold },
    role: { fontSize: typography.label.fontSize, fontFamily: fontFamily.regular },
    status: { fontSize: typography.caption.fontSize, fontFamily: fontFamily.medium },
    callButton: {
      minWidth: touchTarget.iconButton,
      minHeight: touchTarget.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
    },
    callDisabled: { opacity: 0.4 },
    empty: { fontSize: typography.body.fontSize, fontFamily: fontFamily.regular },
  });
