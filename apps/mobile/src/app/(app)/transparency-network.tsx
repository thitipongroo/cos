// Transparency Portal — Network origin (mockup 03_01_ip_address_details, per ADR-080).
//
// Three corrections the ADR made to this screen, all visible here:
//
//   1. LATENCY AND CONNECTION TYPE ARE MEASURED ON THIS DEVICE, not inferred from the address.
//      Geo-IP guesses about the network; the handset knows both for certain. More accurate AND less
//      data — the round trip is timed here, and the connection type comes from netinfo.
//   2. THE BEHAVIOURAL LABEL IS PROFILING and is gated on `operational` consent. `behavioral: null`
//      means "Not enabled" — a statement that the platform is NOT doing this — which the screen must
//      render differently from INSUFFICIENT_DATA ("we would, but you have too few check-ins").
//   3. RETENTION IS NOT 30 DAYS FLAT. The mockup said so; the real schedule is 30 days hot / 1 year
//      cold for application logs and 7 years WORM for audit entries (§31.2, §31.4).
//
// The rule's thresholds travel with the verdict so the screen can state a derivation. "Stationary
// Worker" with no definition cannot be contested by the person it describes.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { LoadingState } from '../../components/LoadingState';
import { useRouter } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useT } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { radius, spacing, touchTarget } from '../../theme/tokens';
import { FieldRow, InfoCard, Lede, SectionLabel } from '../../components/TransparencyKit';
import { getNetworkOrigin, type NetworkOriginPanel } from '../../api/networkOrigin';
import { screenChrome } from '../../theme/screenStyles';

export default function TransparencyNetworkScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();
  const isDark = useIsDark();
  const router = useRouter();

  const [panel, setPanel] = useState<NetworkOriginPanel | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [connection, setConnection] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    // Timed around the real request rather than a synthetic ping: what the reader wants to know is
    // how long THIS app's calls take, and a separate probe would measure a different path.
    const startedAt = Date.now();
    try {
      const result = await getNetworkOrigin();
      setLatencyMs(Date.now() - startedAt);
      setPanel(result);
    } catch {
      // No panel rather than a partial one. A screen that says what the platform knows about you
      // must not guess at it when the request failed.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    NetInfo.fetch()
      .then((s) => setConnection(s.type))
      .catch(() => setConnection(null));
  }, [load]);

  const styles = useMemo(() => makeStyles(pal), [pal]);

  return (
    <ScrollView
      testID="transparency-network"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.network.lede')}</Lede>

      {loading ? (
        <LoadingState testID="network-loading" variant="list" theme={isDark ? 'dark' : 'light'} />
      ) : null}

      {failed ? (
        <InfoCard
          testID="network-unavailable"
          icon="cloud-off"
          title={t('transparency.network.unavailable')}
          body={t('transparency.network.unavailableBody')}
        />
      ) : null}

      {panel ? (
        <>
          <SectionLabel>{t('transparency.network.origin')}</SectionLabel>
          {/* Null origin is its own answer, not an empty row: no GeoLite2 database is configured in
              dev, CI and every air-gapped install until the MaxMind licence is cleared (ADR-080). */}
          {panel.origin ? (
            <>
              <FieldRow
                testID="network-place"
                label={t('transparency.network.place')}
                value={
                  [panel.origin.city, panel.origin.region, panel.origin.countryIsoCode]
                    .filter(Boolean)
                    .join(', ') || t('transparency.network.placeUnknown')
                }
                note={t('transparency.network.placeNote')}
              />
              <FieldRow
                testID="network-isp"
                label={t('transparency.network.isp')}
                value={panel.origin.organisation ?? t('transparency.network.placeUnknown')}
                note={t('transparency.network.ispNote')}
              />
            </>
          ) : (
            <InfoCard
              testID="network-origin-none"
              icon="location-off"
              title={t('transparency.network.noOrigin')}
              body={t('transparency.network.noOriginBody')}
            />
          )}

          <SectionLabel>{t('transparency.network.device')}</SectionLabel>
          <FieldRow
            testID="network-connection"
            label={t('transparency.network.connection')}
            value={
              connection
                ? t(`transparency.network.conn.${connection}`)
                : t('transparency.network.placeUnknown')
            }
            note={t('transparency.network.connectionNote')}
          />
          <FieldRow
            testID="network-latency"
            label={t('transparency.network.latency')}
            value={
              latencyMs === null ? '—' : t('transparency.network.ms', { n: String(latencyMs) })
            }
            note={t('transparency.network.latencyNote')}
          />

          <SectionLabel>{t('transparency.network.behaviour')}</SectionLabel>
          {panel.behavioral === null ? (
            // "Not enabled" — the platform is not deriving this. Deliberately NOT the same card as
            // INSUFFICIENT_DATA below: collapsing them would tell someone who declined profiling
            // that the platform merely lacked data about them.
            <InfoCard
              testID="network-behaviour-off"
              icon="visibility-off"
              title={t('transparency.network.behaviourOff')}
              body={t('transparency.network.behaviourOffBody')}
            />
          ) : (
            <InfoCard
              testID={`network-behaviour-${panel.behavioral.context}`}
              icon={panel.behavioral.context === 'STATIONARY' ? 'place' : 'alt-route'}
              title={t(`transparency.network.context.${panel.behavioral.context}`)}
              body={t(`transparency.network.contextBody.${panel.behavioral.context}`, {
                points: String(panel.behavioral.pointCount),
                metres: String(panel.behavioral.maxDistanceMetres ?? 0),
                days: String(panel.rule.windowDays),
                radius: String(panel.rule.radiusMetres),
                min: String(panel.rule.minPoints),
              })}
            />
          )}
          {/* The rule itself, always — so the label above is a derivation the reader can check
              rather than an assertion about them they cannot argue with. */}
          <InfoCard
            testID="network-rule"
            icon="rule"
            title={t('transparency.network.rule')}
            body={t('transparency.network.ruleBody', {
              days: String(panel.rule.windowDays),
              radius: String(panel.rule.radiusMetres),
              min: String(panel.rule.minPoints),
            })}
          />

          {/* No `title` — the SectionLabel above already says it (see InfoCard). */}
          <SectionLabel>{t('transparency.network.retention')}</SectionLabel>
          <InfoCard
            testID="network-retention"
            icon="inventory-2"
            body={t('transparency.network.retentionBody')}
          />
        </>
      ) : null}

      {/* ADR-080 repurposed the mockup's "Request Network Refresh": there is no geo-fence to
          re-verify against, so the action is a re-attestation of this device instead. */}
      <Pressable
        testID="network-reattest"
        accessibilityRole="button"
        style={styles.action}
        onPress={() => router.push('/network-reattest')}
      >
        <Text style={styles.actionText}>{t('transparency.network.reattest')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const makeStyles = (p: ReturnType<typeof usePalette>) =>
  StyleSheet.create({
    ...screenChrome(p),
    action: {
      minHeight: touchTarget.primaryButton,
      marginTop: spacing.md,
      // `rounded-lg` in the mockup = 4px under its own radius override, not Tailwind's default 8.
      borderRadius: radius.md,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
  });
