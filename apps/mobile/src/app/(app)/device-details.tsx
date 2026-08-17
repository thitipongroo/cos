// Device ID details (mockup 03_03_device_id_details) — ADR-081, ADR-082, ADR-083.
//
// Four things the mockup claimed, and what replaced each:
//
//   1. "Real-time Trust Score 98% · AI VERIFIED" — a number true of no device, over nothing. Now the
//      real score with every contributing signal shown, and the badge follows the server's
//      `scoredBy`: it says rule-based until a model has beaten that baseline on PR-AUC (ADR-081).
//   2. "UNIQUE HARDWARE ID" — it is not a hardware id. It is a per-install identifier this app mints
//      and keeps in secure storage (migration 20260716000003 is explicit: "not a hardware serial").
//      Reinstalling produces a new one. Calling it hardware-unique would overstate what it identifies.
//   3. "BINDING METHOD: Biometric + Hardware Enclave" — the signing key is created with
//      `requireUserAuthentication: false` (lib/deviceTrust.ts) so the trust check can run silently at
//      login. It is hardware-backed and it is NOT biometric-bound; app unlock is a separate,
//      optional control that lives on the account security screen.
//   4. "SECURITY PATCH LEVEL 2023-10-05" — no attestation verdict on either platform carries a patch
//      date (ADR-083). The integrity tier is shown instead: it is the conclusion the date was only
//      evidence for, and on Android 13+ STRONG already means "patched within the last year".

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LoadingState } from '../../components/LoadingState';
import { useT } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { fontFamily, spacing, typography } from '../../theme/tokens';
import { FieldRow, InfoCard, Lede, SectionLabel } from '../../components/TransparencyKit';
import {
  getDeviceTrustScore,
  listDevices,
  type DeviceTrustReport,
  type TrustedDeviceSummary,
} from '../../api/devices';
import { getDeviceId } from '../../lib/deviceTrust';
import {
  attestationBand,
  cappingSignal,
  integrityRow,
  scorerBadge,
  signalRows,
  trustTone,
} from '../../lib/trustScore';

export default function DeviceDetailsScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();
  const isDark = useIsDark();

  const [device, setDevice] = useState<TrustedDeviceSummary | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [report, setReport] = useState<DeviceTrustReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const id = await getDeviceId();
      setDeviceId(id);
      const devices = await listDevices();
      setDevice(devices.find((d) => d.deviceId === id) ?? null);
      try {
        setReport(await getDeviceTrustScore(id));
      } catch {
        // The score is behind a feature flag that answers 503 when off, and it is advisory by
        // design (§22.3). A missing panel is not an error for this screen — everything else here
        // is a stored fact and still worth showing.
        setReport(null);
      }
    } catch {
      setDevice(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const styles = makeStyles(pal);
  const capping = report ? cappingSignal(report) : null;

  return (
    <ScrollView
      testID="device-details"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('deviceDetails.lede')}</Lede>

      {loading ? (
        <LoadingState testID="device-loading" variant="widget" theme={isDark ? 'dark' : 'light'} />
      ) : null}

      {!loading && !device ? (
        <InfoCard
          testID="device-not-enrolled"
          icon="phonelink-erase"
          title={t('deviceDetails.notEnrolled')}
          body={t('deviceDetails.notEnrolledBody')}
        />
      ) : null}

      {report ? (
        <>
          <SectionLabel>{t('deviceDetails.score')}</SectionLabel>
          <View testID="device-score" style={styles.gauge}>
            <Text style={[styles.gaugeValue, { color: toneColour(pal, trustTone(report.score)) }]}>
              {`${report.score}`}
            </Text>
            <Text style={styles.gaugeMax}>
              {t('deviceDetails.outOf', { max: String(report.maxScore) })}
            </Text>
            {/* The badge is the ADR-081 naming rule made visible. There is no branch here that can
                produce "AI" while the server says RULES. */}
            <Text testID={`device-scorer-${scorerBadge(report)}`} style={styles.badge}>
              {t(`deviceDetails.scorer.${scorerBadge(report)}`)}
            </Text>
          </View>

          {capping ? (
            <InfoCard
              testID="device-capped"
              icon="report"
              title={t('deviceDetails.capped')}
              body={t(`deviceDetails.cappedBy.${capping.band}`)}
            />
          ) : null}

          {/* Worst deficit first: the reader's question is "why is this not full marks", and a list
              opening with everything that passed buries the answer. */}
          {signalRows(report).map((s) => (
            <FieldRow
              key={s.signal}
              testID={`device-signal-${s.signal}`}
              label={t(`deviceDetails.signal.${s.signal}`)}
              value={t(`deviceDetails.band.${s.band}`)}
              note={t('deviceDetails.points', {
                points: String(s.points),
                max: String(s.maxPoints),
              })}
            />
          ))}
          <Text style={styles.provenance}>
            {t('deviceDetails.rulesVersion', { v: report.rulesVersion })}
          </Text>
        </>
      ) : null}

      {device ? (
        <>
          <SectionLabel>{t('deviceDetails.identity')}</SectionLabel>
          <FieldRow
            testID="device-install-id"
            label={t('deviceDetails.installId')}
            value={deviceId ?? '—'}
            // Names it for what it is. "Unique hardware id" would claim this survives a reinstall
            // and identifies the handset itself; it does neither.
            note={t('deviceDetails.installIdNote')}
          />
          <FieldRow
            testID="device-model"
            label={t('deviceDetails.model')}
            value={device.model ?? t('deviceDetails.unknownModel')}
            note={t('deviceDetails.modelNote')}
          />
          <FieldRow
            testID="device-binding"
            label={t('deviceDetails.binding')}
            value={t('deviceDetails.bindingValue')}
            note={t('deviceDetails.bindingNote')}
          />

          <SectionLabel>{t('deviceDetails.platformIntegrity')}</SectionLabel>
          {/* Four outcomes, not the mockup's binary PASSED. "We asked and could not be told" and "we
              never asked" are neither a pass nor an accusation. */}
          <FieldRow
            testID={`device-integrity-${integrityRow(attestationBand(device))}`}
            label={t('deviceDetails.rootCheck')}
            value={t(`deviceDetails.integrity.${integrityRow(attestationBand(device))}`)}
            note={t(`deviceDetails.integrityNote.${integrityRow(attestationBand(device))}`)}
          />
          <FieldRow
            testID="device-tier"
            label={t('deviceDetails.tier')}
            value={
              device.integrityLevel
                ? t(`deviceDetails.tierValue.${device.integrityLevel}`)
                : t('deviceDetails.tierNone')
            }
            // Replaces the mockup's patch date. ADR-083: neither platform reports one, and the
            // remaining source for such a date would be the device itself — attacker-controlled on
            // exactly the rooted device the row exists to detect.
            note={t('deviceDetails.tierNote')}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

function toneColour(p: ReturnType<typeof usePalette>, tone: 'STRONG' | 'FAIR' | 'WEAK'): string {
  if (tone === 'STRONG') return p.success;
  if (tone === 'FAIR') return p.warning;
  return p.danger;
}

const makeStyles = (p: ReturnType<typeof usePalette>) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    gauge: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md },
    gaugeValue: { fontFamily: fontFamily.bold, fontSize: 56 },
    gaugeMax: { fontSize: typography.caption.fontSize, color: p.muted },
    badge: {
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      color: p.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    provenance: { fontSize: typography.label.fontSize, color: p.muted, marginTop: spacing.xs },
  });
