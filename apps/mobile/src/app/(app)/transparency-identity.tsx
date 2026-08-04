// Transparency Portal — Identity & contact (mockup 01_00_identity_contact_details).
//
// The one screen in the portal that shows REAL stored values, read from GET /api/v1/users/me (the
// endpoint already exists and returns exactly these fields, including photo_url).
//
// Dropped from the mockup, both verified against the schema on 2026-08-04:
//   - "Biometric Hash SHA-256: 0x9f86…" — no biometric column exists in any migration, and the
//     Privacy Policy states plainly that we collect no biometric identifiers. Showing a hash here
//     would contradict our own notice on the same device.
//   - "Employee ID C-8922-X" — employee_code lives on workforce.workers, which carries no FK to
//     platform.users. There is no join, so there is no value to show for the signed-in account.
// The Export / Update-preferences actions render disabled: PDPA-10/11/14 are OPEN, no route exists.

import { useEffect, useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { get } from '../../api/client';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { useAuthStore } from '../../store/authStore';
import { fontFamily, spacing, typography } from '../../theme/tokens';
import type { Palette } from '../../theme/palette';
import {
  SectionLabel,
  Lede,
  FieldRow,
  InfoCard,
  DisabledAction,
} from '../../components/TransparencyKit';

/** Shape of GET /api/v1/users/me that this screen reads. Extra fields are ignored. */
interface MeResponse {
  display_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  photo_url?: string | null;
}

const PURPOSES = [
  { key: 'purposeAuth', icon: 'lock' },
  { key: 'purposeSafety', icon: 'notifications-active' },
  { key: 'purposeAudit', icon: 'history-edu' },
] as const;

export default function TransparencyIdentityScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();
  const styles = makeStyles(pal);
  const role = useAuthStore((s) => s.role);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let alive = true;
    get<MeResponse>('/users/me')
      .then((res) => {
        if (alive) setMe(res);
      })
      .catch(() => {
        // Offline or transient. Say so rather than rendering blanks that read as "we hold nothing".
        if (alive) setOffline(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = (v: string | null | undefined): string =>
    v?.trim() || t('transparency.identity.field.none');

  return (
    <ScrollView
      testID="transparency-identity"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.identity.lede')}</Lede>

      <SectionLabel>{t('transparency.identity.stored')}</SectionLabel>
      {loading ? (
        <ActivityIndicator testID="transparency-identity-loading" color={pal.primary} />
      ) : (
        <View style={styles.fields}>
          {offline ? (
            <Text style={styles.offline}>{t('transparency.identity.offline')}</Text>
          ) : null}
          <FieldRow
            testID="identity-name"
            label={t('transparency.identity.field.name')}
            value={value(me?.display_name)}
          />
          <FieldRow
            testID="identity-email"
            label={t('transparency.identity.field.email')}
            value={value(me?.email)}
          />
          <FieldRow
            testID="identity-phone"
            label={t('transparency.identity.field.phone')}
            value={value(me?.phone_number)}
          />
          <FieldRow
            testID="identity-photo"
            label={t('transparency.identity.field.photo')}
            value={
              me?.photo_url
                ? t('transparency.identity.field.photoSet')
                : t('transparency.identity.field.photoNone')
            }
          />
          <FieldRow
            testID="identity-role"
            label={t('transparency.identity.field.role')}
            value={role ? String(role) : t('transparency.identity.field.none')}
          />
        </View>
      )}

      <SectionLabel>{t('transparency.identity.purpose')}</SectionLabel>
      {PURPOSES.map((p) => (
        <InfoCard
          key={p.key}
          icon={p.icon}
          title={t(`transparency.identity.${p.key}.title`)}
          body={t(`transparency.identity.${p.key}.body`)}
        />
      ))}

      <SectionLabel>{t('transparency.identity.access')}</SectionLabel>
      <InfoCard
        icon="visibility"
        title={t('transparency.identity.access')}
        body={t('transparency.identity.accessBody')}
      />

      <SectionLabel>{t('transparency.identity.manage')}</SectionLabel>
      <DisabledAction
        testID="identity-export"
        icon="download"
        label={t('transparency.identity.actionExport')}
        comingSoon={t('transparency.comingSoon')}
      />
      <DisabledAction
        testID="identity-update"
        icon="edit"
        label={t('transparency.identity.actionUpdate')}
        comingSoon={t('transparency.comingSoon')}
      />
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    fields: { gap: spacing.xs },
    offline: {
      color: p.warning,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });
