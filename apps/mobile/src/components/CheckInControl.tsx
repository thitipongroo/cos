// Self check-in — the SITE_WORKER's daily attendance write, offline-queued.
//
// LIVES IN THE NAVIGATION DRAWER as of 2026-08-09 (product-owner decision). It was on the Home
// screen until then; extracting it into a component rather than moving the JSX keeps the logic in
// one place and lets the drawer host it without importing a screen.
//
// THE PROJECT PICKER CAME WITH IT, and had to. `recordCheckIn` writes an attendance row against a
// project, and an attendance row with no project is unusable — so whichever surface carries the
// button has to carry the choice. The alternative would be a global "current project" store, which
// does not exist: every screen holds its own `useState` selection, so a drawer button acting on
// "the selected project" would be acting on a selection it cannot see.
//
// Offline-safe by construction: `recordCheckIn` goes through mutate() (queued when offline) and the
// local row is written either way, so the tile on Home reads the shift immediately.

import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { db, newLocalId } from '../db/database';
import { localAttendance } from '../db/schema';
import { getMyWorker, recordCheckIn } from '../api/workforce';
import { ProjectPicker } from './ProjectPicker';
import { useT } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette } from '../theme/usePalette';

export function CheckInControl({ onDone }: { onDone?: () => void }) {
  const [projectId, setProjectId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const t = useT();
  const p = usePalette();

  const disabled = busy || projectId.trim() === '';

  const onCheckIn = async (): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      const worker = await getMyWorker(); // 404 if no worker is linked to this user
      const now = new Date().toISOString();
      await recordCheckIn(worker.worker_id, projectId.trim(), now); // offline-queued via mutate()
      await db.insert(localAttendance).values({
        id: newLocalId(),
        logId: '',
        workerId: worker.worker_id,
        projectId: projectId.trim(),
        checkInAt: now,
        checkOutAt: null,
        hoursWorked: null,
        offlineSyncStatus: 'PENDING',
      });
      setMessage(t('home.main.checkedIn'));
      // The drawer closes only on SUCCESS, and only after the message is set — a failure has to stay
      // on screen to be read.
      onDone?.();
    } catch {
      setMessage(t('home.main.checkInError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="check-in-control" style={styles.root}>
      <ProjectPicker selectedId={projectId} onSelect={setProjectId} />
      <TouchableOpacity
        testID="check-in-button"
        style={[styles.button, { backgroundColor: p.primary }, disabled && styles.buttonDisabled]}
        onPress={() => void onCheckIn()}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={t('home.main.checkIn')}
        accessibilityState={{ disabled }}
      >
        <Text style={[styles.buttonText, { color: p.onPrimary }]}>{t('home.main.checkIn')}</Text>
      </TouchableOpacity>
      {message ? (
        <Text testID="check-in-status" style={[styles.message, { color: p.muted }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  button: {
    minHeight: touchTarget.primaryButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
  },
  message: { fontSize: typography.caption.fontSize, fontFamily: fontFamily.regular },
});
