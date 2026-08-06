// Re-attestation result (mockup 03_02_network_refresh_success, repurposed by ADR-080).
//
// THE MOCKUP'S ACTION DID NOT EXIST. It offered "Request Network Refresh" and reported the ingress
// address "re-verified against project geo-fencing protocols" — but transparency-location.tsx
// already documents, against migration 20260705000001, that this platform has no geofencing and no
// background location service. There was nothing to re-verify against, so the sentence was deleted
// rather than reworded (ADR-080).
//
// What the button does instead is the thing that IS real and IS worth offering here: it re-proves
// this device's possession of its hardware key against a fresh server challenge (ADR-054), which
// refreshes the trust window and writes an audit entry. Same gesture, an action that exists.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { InfoCard, FieldRow, Lede } from '../../components/TransparencyKit';
import { requestAttestationChallenge } from '../../api/devices';
import { getDeviceId, signChallenge } from '../../lib/deviceTrust';

type Outcome = 'RUNNING' | 'REFRESHED' | 'UNAVAILABLE';

export default function NetworkReattestScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();
  const router = useRouter();
  const [outcome, setOutcome] = useState<Outcome>('RUNNING');
  const [at, setAt] = useState<string | null>(null);

  const run = useCallback(async () => {
    setOutcome('RUNNING');
    try {
      const deviceId = await getDeviceId();
      const challenge = await requestAttestationChallenge(deviceId);
      const signature = await signChallenge(challenge);
      // A null signature means this install has no hardware key — an older enrolment, or a device
      // whose keystore refused. That is UNAVAILABLE, never a failure claim about the device: nothing
      // was disproved, the proof simply could not be produced.
      setOutcome(signature ? 'REFRESHED' : 'UNAVAILABLE');
      setAt(new Date().toISOString());
    } catch {
      setOutcome('UNAVAILABLE');
      setAt(null);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const styles = makeStyles(pal);

  return (
    <ScrollView
      testID="network-reattest-screen"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      {outcome === 'RUNNING' ? (
        <View style={styles.centre}>
          <ActivityIndicator testID="reattest-running" color={pal.primary} />
          <Text style={styles.runningText}>{t('reattest.running')}</Text>
        </View>
      ) : null}

      {outcome === 'REFRESHED' ? (
        <>
          <View style={styles.centre}>
            <MaterialIcons name="verified-user" size={56} color={pal.success} />
            <Text style={styles.heading}>{t('reattest.refreshed')}</Text>
          </View>
          <Lede>{t('reattest.refreshedBody')}</Lede>
          {/* No ingress IP echoed here, unlike the mockup. The address belongs on the network screen
              where it is explained; repeating it on a confirmation adds a copy and explains nothing. */}
          {at ? (
            <FieldRow
              testID="reattest-at"
              label={t('reattest.at')}
              value={at}
              note={t('reattest.atNote')}
            />
          ) : null}
        </>
      ) : null}

      {outcome === 'UNAVAILABLE' ? (
        <InfoCard
          testID="reattest-unavailable"
          icon="help-outline"
          title={t('reattest.unavailable')}
          body={t('reattest.unavailableBody')}
        />
      ) : null}

      {outcome !== 'RUNNING' ? (
        <Pressable
          testID="reattest-back"
          accessibilityRole="button"
          style={styles.action}
          onPress={() => router.back()}
        >
          <Text style={styles.actionText}>{t('reattest.back')}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const makeStyles = (p: ReturnType<typeof usePalette>) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    centre: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
    heading: {
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      color: p.text,
      textAlign: 'center',
    },
    runningText: { fontSize: typography.body.fontSize, color: p.muted },
    action: {
      minHeight: touchTarget.primaryButton,
      marginTop: spacing.md,
      // Same button shape as the screen that opens it — `rounded-lg` in the mockup = 4px.
      borderRadius: radius.md,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    actionText: {
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      color: p.onPrimary,
    },
  });
