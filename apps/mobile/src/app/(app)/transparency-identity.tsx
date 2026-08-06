// Transparency Portal — Identity & contact (mockup 01_00_identity_contact_details).
//
// The one screen in the portal that shows REAL stored values, read from GET /api/v1/users/me (the
// endpoint already exists and returns exactly these fields, including photo_url).
//
// Dropped from the mockup:
//   - "Biometric Hash SHA-256: 0x9f86…" — no biometric column exists in any migration, and the
//     Privacy Policy states plainly that we collect no biometric identifiers. Showing a hash here
//     would contradict our own notice on the same device.
//   - "Employee ID C-8922-X" — employee_code lives on workforce.workers. It is NOT rendered because
//     GET /api/v1/users/me does not return it, not because it is unreachable.
//
// CORRECTION (2026-08-04). This header previously claimed workforce.workers "carries no FK to
// platform.users. There is no join." That is wrong, and it was wrong when written: migration
// 20260624000001_workers_user_id (2026-06-24) added `workforce.workers.user_id`, nullable, with
// `uq_workers_user_id` unique per tenant where set, precisely so a signed-in SITE_WORKER can resolve
// "my worker" for GET /api/v1/workers/me. The link is a nullable column rather than a foreign key
// (workers predate it, and it lives in a different schema), which is presumably how "no FK" turned
// into "no join" — but a nullable unique column IS a join, and the PDPA data export relies on it to
// attribute a worker's records to the person who asked for them (ADR-078).
//
// Whether this screen should now SHOW employee_code is a product decision, not a schema one: the
// value is reachable, /users/me just does not return it today. Left unrendered pending that call.
//
// The Export / Update-preferences actions render disabled: PDPA-10/11/14 are OPEN, no route exists.

import { useEffect, useState } from 'react';
import { ScrollView, View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { get } from '../../api/client';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { useAuthStore } from '../../store/authStore';
import { fontFamily, spacing, typography } from '../../theme/tokens';
import type { Palette } from '../../theme/palette';
import { formatNationalPhone } from '@cos/ui-logic';
import { initialsOf } from '../../lib/initials';
import { formatRole } from '../../lib/formatRole';
import { shortId } from '../../lib/shortId';
import {
  SectionLabel,
  SectionLabelRow,
  HeroCard,
  FieldCard,
  TwoUp,
  TwoUpCell,
  AccentCard,
  AccentRow,
  InfoCard,
  ActionRow,
  DangerLink,
} from '../../components/TransparencyKit';

/** Shape of GET /api/v1/users/me that this screen reads. Extra fields are ignored. */
interface MeResponse {
  display_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  photo_url?: string | null;
  /**
   * `workforce.workers.employee_code`, joined in by `/users/me` (PO decision 2026-08-06).
   *
   * NULL IS ORDINARY, not an error. The worker link is nullable and only site workers have a worker
   * record — project managers, tenant admins and finance legitimately have none. The screen says so
   * in words rather than hiding the row: on a page listing what is held about you, an identifier
   * that was never issued is itself worth stating.
   */
  employee_code?: string | null;
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
  const router = useRouter();
  const role = useAuthStore((s) => s.role);
  const userId = useAuthStore((s) => s.userId);
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
      {/* The mockup's hero says these fields are "cryptographically hashed". They are not — a hashed
          name could not be rendered on this screen, and the two lines would contradict each other on
          one page. What IS true is that the database is encrypted at rest (§5.2, AES-256 SSE-KMS),
          which is what the panel and the schema tag below say instead. */}
      <HeroCard
        testID="identity-hero"
        icon="badge"
        eyebrow={t('transparency.identity.heroEyebrow')}
        title={t('transparency.identity.title')}
        body={t('transparency.identity.lede')}
      />

      <SectionLabelRow
        label={t('transparency.identity.stored')}
        tag={t('transparency.identity.schemaTag')}
      />
      {loading ? (
        <ActivityIndicator testID="transparency-identity-loading" color={pal.primary} />
      ) : (
        <View style={styles.fields}>
          {offline ? (
            <Text style={styles.offline}>{t('transparency.identity.offline')}</Text>
          ) : null}
          {/* The source chip is the point of these cards: the reader's next question after "what do
              you hold" is "where did it come from", and every one of these came from the account
              itself rather than from anything the platform inferred. */}
          {/* The identifier first, because it is the one the platform holds you BY: every audit
              entry, every record and every request keys on it, and a screen listing what is stored
              about someone should not omit the handle it stores them under (PO decision 2026-08-06).
              Shown in the same eight-character short form the admin screens already use.

              NOT an "employee ID". The mockup's accordion had one (`C-8922-X`); no employee or staff
              number column exists in the schema, and labelling an account identifier as an HR one
              would be the kind of invented fact this whole portal exists to avoid (ADR-085). */}
          <FieldCard
            testID="identity-uid"
            label={t('transparency.identity.field.uid')}
            value={userId ? shortId(userId) : value(null)}
            source={t('transparency.identity.sourceAccount')}
          />
          {/* The employer's own code for this person, joined from workforce.workers. It is the one
              row of the mockup's accordion that turned out to describe something real (ADR-085).

              Its source chip differs from every other card here: this value came from the EMPLOYER's
              workforce records, not from the account, and on a screen whose whole point is "where
              did this come from" that distinction is the information. */}
          <FieldCard
            testID="identity-employee-code"
            label={t('transparency.identity.field.employeeCode')}
            value={me?.employee_code?.trim() || t('transparency.identity.field.noEmployeeCode')}
            source={t('transparency.identity.sourceWorkforce')}
          />
          <FieldCard
            testID="identity-name"
            label={t('transparency.identity.field.name')}
            value={value(me?.display_name)}
            source={t('transparency.identity.sourceAccount')}
          />
          <FieldCard
            testID="identity-email"
            label={t('transparency.identity.field.email')}
            value={value(me?.email)}
            source={t('transparency.identity.sourceAccount')}
          />
          <FieldCard
            testID="identity-phone"
            label={t('transparency.identity.field.phone')}
            // §20.5: displayed 0XX-XXX-XXXX. Stored E.164 — the trunk 0 is restored for display.
            value={value(me?.phone_number && formatNationalPhone(me.phone_number))}
            source={t('transparency.identity.sourceAccount')}
          />
          {/* Glyph + two words, per `01_00_identity_contact_details:208-227`. The photo cell shows
              the photo itself when there is one — on a screen about what the platform stores, the
              stored thing is better evidence than a sentence describing it — and the initials the
              app actually falls back to when there is not.

              `photoNone` is just "Not set" for that reason. It used to read "Not set — your
              initials are shown instead", which wrapped to three lines in a half-width cell to
              explain the very thing the circle beside it is already doing. */}
          <TwoUp>
            <TwoUpCell
              testID="identity-photo"
              label={t('transparency.identity.field.photo')}
              avatar={{ uri: me?.photo_url, initials: initialsOf(me?.display_name) }}
              value={
                me?.photo_url
                  ? t('transparency.identity.field.photoSet')
                  : t('transparency.identity.field.photoNone')
              }
            />
            <TwoUpCell
              testID="identity-role"
              label={t('transparency.identity.field.role')}
              icon="badge"
              value={role ? formatRole(String(role)) : t('transparency.identity.field.none')}
            />
          </TwoUp>
        </View>
      )}

      <AccentCard testID="identity-purpose" icon="info" title={t('transparency.identity.purpose')}>
        {PURPOSES.map((p) => (
          <AccentRow
            key={p.key}
            testID={`identity-${p.key}`}
            icon={p.icon}
            title={t(`transparency.identity.${p.key}.title`)}
            body={t(`transparency.identity.${p.key}.body`)}
          />
        ))}
      </AccentCard>

      {/* No `title` — the SectionLabel above already says it (see InfoCard). */}
      <SectionLabel>{t('transparency.identity.access')}</SectionLabel>
      <InfoCard icon="visibility" body={t('transparency.identity.accessBody')} />

      <SectionLabel>{t('transparency.identity.manage')}</SectionLabel>
      {/* These were DisabledAction "coming soon" rows. PDPA-10/11 shipped (ADR-078) and the flag was
          flipped ON at 100% on 2026-08-05, so the export is reachable — and contact preferences were
          always reachable through notification-preferences.tsx. A control that says "coming soon"
          over a feature that exists is the same class of wrong as one that pretends to work. */}
      {/* ActionRow, not NavCard: `01_00_identity_contact_details:278-291` gives these rows an icon,
          a title and a chevron and NOTHING ELSE. The body each one used to carry described the
          screen it opens, which by this point in the page has already been said — the reader has
          just been told what is stored, why, and who can see it. */}
      <ActionRow
        testID="identity-export"
        icon="download"
        title={t('transparency.identity.actionExport')}
        onPress={() => router.push('/data-export')}
      />
      <ActionRow
        testID="identity-update"
        icon="tune"
        title={t('transparency.identity.actionUpdate')}
        onPress={() => router.push('/notification-preferences')}
      />
      {/* The mockup closes the section with this (`:294-297`) and so does the hub. Erasure is the
          one right a reader is most likely to have come here to exercise, and burying it one screen
          back would be a poor place to hide it. */}
      <DangerLink
        testID="identity-delete"
        icon="delete-outline"
        label={t('transparency.portal.requestDeletion')}
        onPress={() => router.push('/transparency-delete')}
      />
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    fields: { gap: spacing.xs },
    cellValue: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
    },
    offline: {
      color: p.warning,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
  });
