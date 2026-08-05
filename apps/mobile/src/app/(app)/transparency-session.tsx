// Transparency Portal — Session metadata (mockup 03_05_session_metadata_details, per ADR-084).
//
// The mockup's System Parameters card asserted three things about this platform that were not true:
// a 3600-second token TTL (it is 15 minutes, §5.4.1), AES-256-GCM session encryption (sessions are
// TLS 1.3 in transit — AES-256-GCM is ADR-035's at-rest cipher for issuer keys, a different
// subsystem), and a SESSION ID field that does not exist anywhere in the platform. ADR-084 replaced
// all three with values traceable to a spec line, and dropped the name "Secure Context Protocol" —
// it is not a protocol and appears nowhere else in this codebase.
//
// The three explanatory cards survived the same review because they turned out to be true: they
// describe the offline sync queue, the RBAC permission map, and Keycloak's native refresh rotation.
//
// The token id shown is `jti`, read from the access token the app already holds — the real answer to
// "which credential is this", with no new field, no new endpoint and nothing new stored.

import { useMemo } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';
import { FieldRow, InfoCard, Lede, SectionLabel } from '../../components/TransparencyKit';
import { useAuthStore } from '../../store/authStore';
import { decodeJwtPayload } from '../../lib/jwt';
import {
  ACCESS_TOKEN_MINUTES,
  REFRESH_TOKEN_DAYS,
  SESSION_CARDS,
  TRANSPORT,
  shortTokenId,
} from '../../lib/sessionFacts';

const CARD_ICONS = {
  offlineQueue: 'cloud-queue',
  rolePermissions: 'admin-panel-settings',
  tokenRotation: 'autorenew',
} as const;

export default function TransparencySessionScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();
  const accessToken = useAuthStore((s) => s.accessToken);

  // Decoded locally from the token this device already holds. No call is made: asking the server
  // "what is my session" would be a request whose answer the client is already carrying.
  const tokenId = useMemo(() => {
    if (!accessToken) return null;
    const jti = decodeJwtPayload(accessToken)['jti'];
    return shortTokenId(typeof jti === 'string' ? jti : null);
  }, [accessToken]);

  return (
    <ScrollView
      testID="transparency-session"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.session.lede')}</Lede>

      <SectionLabel>{t('transparency.session.how')}</SectionLabel>
      {SESSION_CARDS.map((key) => (
        <InfoCard
          key={key}
          testID={`session-card-${key}`}
          icon={CARD_ICONS[key]}
          title={t(`transparency.session.card.${key}.title`)}
          body={t(`transparency.session.card.${key}.body`)}
        />
      ))}

      <SectionLabel>{t('transparency.session.parameters')}</SectionLabel>
      <FieldRow
        testID="session-access-ttl"
        label={t('transparency.session.param.accessToken')}
        value={t('transparency.session.minutes', { n: String(ACCESS_TOKEN_MINUTES) })}
        note={t('transparency.session.param.accessTokenNote')}
      />
      <FieldRow
        testID="session-refresh-ttl"
        label={t('transparency.session.param.refreshToken')}
        value={t('transparency.session.days', { n: String(REFRESH_TOKEN_DAYS) })}
        note={t('transparency.session.param.refreshTokenNote')}
      />
      <FieldRow
        testID="session-transport"
        label={t('transparency.session.param.transport')}
        value={TRANSPORT}
        note={t('transparency.session.param.transportNote')}
      />
      {/* Absent rather than blank when there is no token: a "—" in a value slot reads as a stored
          value the platform is withholding, which is the opposite of what this screen is for. */}
      {tokenId ? (
        <FieldRow
          testID="session-token-id"
          label={t('transparency.session.param.tokenId')}
          value={tokenId}
          note={t('transparency.session.param.tokenIdNote')}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
});
