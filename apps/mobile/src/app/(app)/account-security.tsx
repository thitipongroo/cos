// Account Security (mockup 03_04_manage_account_access) — the user's own trusted devices.
//
// THE BIOMETRIC TOGGLE LEFT THIS SCREEN ON 2026-09-13. It landed here because `biometricStore
// .setEnabled` had no caller at all and this was the screen the mockup put it on — but
// <AccountSettings /> had grown its own copy, so one preference was settable in two places and a
// user who changed it here saw the other one stale until that screen refetched. The Stitch screen
// `63c6dccafa734761a077835aabd70838` groups it under Security & Access with the password and the
// second factor, which is where it now lives, ONCE. This screen keeps the devices it is named for.
//
// TWO CORRECTIONS to the mockup:
//   - It lists a MacBook and an iPad. This platform enrols MOBILE installs only (ADR-054: the key
//     lives in a Secure Enclave / Android Keystore, and the web app has no enrolment path), so the
//     list shows what is actually enrolled rather than an aspirational device fleet.
//   - Its REVOKE button carries no reason. The server requires one (ADR-081) because COMPROMISED is
//     the trust model's only positive class, so revoking asks which it was — and the answer is the
//     user's, never a client-side default.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LoadingState } from '../../components/LoadingState';
import { useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { InfoCard, Lede, SectionLabel } from '../../components/TransparencyKit';
import { listDevices, revokeDevice, type TrustedDeviceSummary } from '../../api/devices';
import { getDeviceId } from '../../lib/deviceTrust';
import { screenChrome } from '../../theme/screenStyles';
import {
  REVOCATION_REASONS,
  isSelfRevocation,
  orderDevices,
  type RevocationChoice,
} from '../../lib/accountSecurity';

export default function AccountSecurityScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();
  const isDark = useIsDark();
  const router = useRouter();

  const [devices, setDevices] = useState<TrustedDeviceSummary[]>([]);
  const [thisDeviceId, setThisDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setThisDeviceId(await getDeviceId());
      setDevices(await listDevices());
    } catch {
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onRevoke = useCallback(
    async (deviceId: string, reason: RevocationChoice) => {
      await revokeDevice(deviceId, reason);
      setRevoking(null);
      await load();
    },
    [load],
  );

  const styles = useMemo(() => makeStyles(pal), [pal]);

  return (
    <ScrollView
      testID="account-security"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('accountSecurity.lede')}</Lede>

      <SectionLabel>{t('accountSecurity.devices')}</SectionLabel>
      {loading ? (
        <LoadingState testID="devices-loading" variant="list" theme={isDark ? 'dark' : 'light'} />
      ) : null}

      {!loading && devices.length === 0 ? (
        <InfoCard
          testID="devices-empty"
          icon="devices"
          title={t('accountSecurity.noDevices')}
          body={t('accountSecurity.noDevicesBody')}
        />
      ) : null}

      {orderDevices(devices, thisDeviceId).map((d) => {
        const isThis = isSelfRevocation(d.deviceId, thisDeviceId);
        return (
          <View key={d.deviceId} testID={`device-row-${d.deviceId}`} style={styles.deviceCard}>
            <View style={styles.deviceHead}>
              <Text style={styles.deviceName}>
                {d.model ?? t(`accountSecurity.platform.${d.platform}`)}
              </Text>
              {isThis ? (
                <Text testID="device-current" style={styles.currentPill}>
                  {t('accountSecurity.thisDevice')}
                </Text>
              ) : null}
            </View>
            <Text style={styles.deviceMeta}>
              {t('accountSecurity.lastSeen', { at: d.lastSeenAt })}
            </Text>

            {isThis ? (
              <Pressable
                testID="device-open-details"
                accessibilityRole="button"
                style={styles.linkAction}
                onPress={() => router.push('/device-details')}
              >
                <Text style={styles.linkActionText}>{t('accountSecurity.viewDetails')}</Text>
              </Pressable>
            ) : null}

            {revoking === d.deviceId ? (
              // The reason picker. Presented as four explicit choices rather than a confirm dialog:
              // COMPROMISED is the trust model's only positive class, and a default would either
              // label ordinary tidying-up as an attack or bury a real compromise among retired
              // handsets.
              <View testID={`revoke-reasons-${d.deviceId}`} style={styles.reasons}>
                <Text style={styles.reasonPrompt}>{t('accountSecurity.whyRevoke')}</Text>
                {/* Revoking the device in your hand ends its trust, so the next login on it needs a
                    full OTP again. Said before the tap, not discovered after it. */}
                {isThis ? (
                  <Text testID="revoke-self-warning" style={styles.reasonPrompt}>
                    {t('accountSecurity.revokeSelfWarning')}
                  </Text>
                ) : null}
                {REVOCATION_REASONS.map((reason) => (
                  <Pressable
                    key={reason}
                    testID={`revoke-${reason}`}
                    accessibilityRole="button"
                    style={styles.reasonRow}
                    onPress={() => void onRevoke(d.deviceId, reason)}
                  >
                    <Text style={styles.reasonText}>{t(`accountSecurity.reason.${reason}`)}</Text>
                  </Pressable>
                ))}
                <Pressable
                  testID="revoke-cancel"
                  accessibilityRole="button"
                  style={styles.reasonRow}
                  onPress={() => setRevoking(null)}
                >
                  <Text style={styles.reasonCancel}>{t('accountSecurity.cancel')}</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                testID={`device-revoke-${d.deviceId}`}
                accessibilityRole="button"
                style={styles.revoke}
                onPress={() => setRevoking(d.deviceId)}
              >
                <Text style={styles.revokeText}>{t('accountSecurity.revoke')}</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const makeStyles = (p: ReturnType<typeof usePalette>) =>
  StyleSheet.create({
    ...screenChrome(p),
    deviceCard: {
      backgroundColor: p.surface,
      borderRadius: radius.lg, // card
      padding: spacing.sm,
      gap: spacing.xs,
    },
    deviceHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    deviceName: { fontFamily: fontFamily.bold, fontSize: typography.body.fontSize, color: p.text },
    currentPill: { fontSize: typography.label.fontSize, color: p.primary },
    deviceMeta: { fontSize: typography.caption.fontSize, color: p.muted },
    linkAction: { minHeight: touchTarget.listItem, justifyContent: 'center' },
    linkActionText: { fontSize: typography.caption.fontSize, color: p.primary },
    revoke: { minHeight: touchTarget.listItem, justifyContent: 'center' },
    revokeText: { fontSize: typography.caption.fontSize, color: p.danger },
    reasons: { gap: spacing.xs, paddingTop: spacing.xs },
    reasonPrompt: { fontSize: typography.caption.fontSize, color: p.muted },
    reasonRow: { minHeight: touchTarget.listItem, justifyContent: 'center' },
    reasonText: { fontSize: typography.body.fontSize, color: p.text },
    reasonCancel: { fontSize: typography.body.fontSize, color: p.muted },
  });
