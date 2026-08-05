// Data export (mockups 01_01_data_export_request → 01_02_export_otp_verification →
// 01_03_data_export_success) — PDPA §30 access / §31 portability, ADR-078.
//
// One route, three stages, because they are one request: the step-up code is bound to THIS export
// and is spent producing it. Splitting them across routes would let a user land on the code screen
// with no pending request, or back-navigate into a consumed token.
//
// THREE CORRECTIONS to the mockup:
//   1. ITS FOUR CATEGORIES DO NOT EXIST. "Personal Identity / Attendance Logs / Activity History /
//      Financial Records" was invented for the design; the platform's taxonomy is the five @pdpa
//      categories the consent screen already uses, and the server rejects anything else with a 400.
//   2. "A code will be sent to your registered device" is only true for Path A accounts. The server
//      chooses SMS when the account has a phone number and email otherwise, and returns which — so
//      the screen reports what actually happened instead of assuming a handset.
//   3. "Sent to your email within 24 hours" IS A PROMISE NOBODY MADE. No SLA exists in ADR-078, in
//      the workflow, or in PDPA §30 (which allows thirty days). The final stage shows the request's
//      real state instead, and offers the download when the server says it is downloadable.

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';
import { InfoCard, Lede, SectionLabel } from '../../components/TransparencyKit';
import {
  exportDownloadUrl,
  requestDataExport,
  requestExportStepUp,
  verifyExportStepUp,
  type DataExportRequest,
  type StepUpChallenge,
} from '../../api/dataExport';
import {
  EXPORT_CATEGORIES,
  EXPORT_FORMATS,
  canSubmitExport,
  describeExport,
  isCompleteStepUpCode,
  toggleCategory,
  type ExportCategory,
  type ExportFormat,
} from '../../lib/dataExport';
import { isFeatureDisabled } from '../../lib/featureFlag';

type Stage = 'CHOOSE' | 'VERIFY' | 'SUBMITTED';

export default function DataExportScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();

  const [stage, setStage] = useState<Stage>('CHOOSE');
  const [categories, setCategories] = useState<ExportCategory[]>([...EXPORT_CATEGORIES]);
  const [format, setFormat] = useState<ExportFormat>('JSON');
  const [challenge, setChallenge] = useState<StepUpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [submitted, setSubmitted] = useState<DataExportRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startStepUp = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setChallenge(await requestExportStepUp());
      setStage('VERIFY');
    } catch (err) {
      // A flag that is off is not a failure, and saying so matters here more than anywhere: PDPA §30
      // is a statutory right, and "your request failed" when the truth is "not switched on yet" is
      // the kind of sentence that ends up in front of a regulator.
      setError(
        t(isFeatureDisabled(err) ? 'dataExport.notAvailableYet' : 'dataExport.stepUpFailed'),
      );
    } finally {
      setBusy(false);
    }
  }, [t]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Verify then request, in one gesture: the action token lives five minutes and is spent on
      // first use, so handing it back to the user between two taps would only give it time to
      // expire.
      const actionToken = await verifyExportStepUp(code);
      setSubmitted(await requestDataExport({ categories, format, actionToken }));
      setStage('SUBMITTED');
    } catch {
      // Wrong code and expired code are the same message on purpose: distinguishing them tells an
      // attacker which of the two they got.
      setError(t('dataExport.codeRejected'));
    } finally {
      setBusy(false);
    }
  }, [categories, code, format, t]);

  const styles = makeStyles(pal);

  return (
    <ScrollView
      testID="data-export"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      {stage === 'CHOOSE' ? (
        <>
          <Lede>{t('dataExport.lede')}</Lede>

          <SectionLabel>{t('dataExport.categories')}</SectionLabel>
          {EXPORT_CATEGORIES.map((c) => {
            const on = categories.includes(c);
            return (
              <Pressable
                key={c}
                testID={`export-cat-${c}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={styles.checkRow}
                onPress={() => setCategories(toggleCategory(categories, c))}
              >
                <MaterialIcons
                  name={on ? 'check-box' : 'check-box-outline-blank'}
                  size={24}
                  color={on ? pal.primary : pal.muted}
                />
                <View style={styles.checkLabel}>
                  <Text style={styles.checkTitle}>{t(`dataExport.cat.${c}.title`)}</Text>
                  <Text style={styles.checkBody}>{t(`dataExport.cat.${c}.body`)}</Text>
                </View>
              </Pressable>
            );
          })}

          <SectionLabel>{t('dataExport.format')}</SectionLabel>
          <View style={styles.formatRow}>
            {EXPORT_FORMATS.map((f) => (
              <Pressable
                key={f}
                testID={`export-format-${f}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: format === f }}
                style={[styles.formatChip, format === f ? styles.formatChipOn : null]}
                onPress={() => setFormat(f)}
              >
                <Text style={format === f ? styles.formatTextOn : styles.formatText}>{f}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>{t(`dataExport.formatHint.${format}`)}</Text>

          {/* The mockup's date-range control is not offered. The server accepts a window, but §30
              entitles the subject to the complete record and a pre-set range on a rights screen
              quietly narrows what they receive. A user who wants less can say so; the default must
              not decide for them. */}
          <InfoCard
            testID="export-verification-note"
            icon="lock"
            title={t('dataExport.verification')}
            body={t('dataExport.verificationBody')}
          />

          {error ? (
            <Text testID="export-error" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Pressable
            testID="export-submit"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmitExport({ categories, format }) || busy }}
            disabled={!canSubmitExport({ categories, format }) || busy}
            style={[
              styles.action,
              !canSubmitExport({ categories, format }) || busy ? styles.actionOff : null,
            ]}
            onPress={() => void startStepUp()}
          >
            {busy ? (
              <ActivityIndicator color={pal.onPrimary} />
            ) : (
              <Text style={styles.actionText}>{t('dataExport.request')}</Text>
            )}
          </Pressable>
        </>
      ) : null}

      {stage === 'VERIFY' && challenge ? (
        <>
          <Lede>
            {t(`dataExport.codeSent.${challenge.channel}`, { hint: challenge.destinationHint })}
          </Lede>
          <TextInput
            testID="export-code"
            style={styles.codeInput}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            accessibilityLabel={t('dataExport.codeLabel')}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
          />
          {error ? (
            <Text testID="export-code-error" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Pressable
            testID="export-verify"
            accessibilityRole="button"
            accessibilityState={{ disabled: !isCompleteStepUpCode(code) || busy }}
            disabled={!isCompleteStepUpCode(code) || busy}
            style={[styles.action, !isCompleteStepUpCode(code) || busy ? styles.actionOff : null]}
            onPress={() => void submit()}
          >
            {busy ? (
              <ActivityIndicator color={pal.onPrimary} />
            ) : (
              <Text style={styles.actionText}>{t('dataExport.verify')}</Text>
            )}
          </Pressable>
        </>
      ) : null}

      {stage === 'SUBMITTED' && submitted ? <ExportResult request={submitted} /> : null}
    </ScrollView>
  );
}

/**
 * The final stage — the request's real state.
 *
 * Deliberately not a static "success" card. The archive is produced by a Temporal workflow across
 * every domain schema, so what the subject is entitled to see is where their request has got to, and
 * a download link only once the SERVER says one can be minted.
 */
function ExportResult({ request }: { request: DataExportRequest }): React.JSX.Element {
  const t = useT();
  const pal = usePalette();
  const styles = makeStyles(pal);
  const view = describeExport(request);
  const [linkError, setLinkError] = useState(false);

  const download = useCallback(async () => {
    setLinkError(false);
    try {
      const { url } = await exportDownloadUrl(request.exportId);
      const { Linking } = await import('react-native');
      await Linking.openURL(url);
    } catch {
      setLinkError(true);
    }
  }, [request.exportId]);

  return (
    <View testID={`export-result-${view.stage}`} style={styles.result}>
      <MaterialIcons
        name={view.stage === 'FAILED' ? 'error-outline' : 'check-circle-outline'}
        size={56}
        color={view.stage === 'FAILED' ? pal.danger : pal.success}
      />
      <Text style={styles.resultTitle}>{t(`dataExport.stage.${view.stage}.title`)}</Text>
      <Text style={styles.resultBody}>{t(`dataExport.stage.${view.stage}.body`)}</Text>

      {/* The server's own sentence, when it has one. Never a stack trace (ADR-078). */}
      {view.failureReason ? (
        <Text testID="export-failure-reason" style={styles.resultBody}>
          {view.failureReason}
        </Text>
      ) : null}

      {view.expiresInDays !== null ? (
        <Text testID="export-expiry" style={styles.hint}>
          {t('dataExport.expiresIn', { n: String(view.expiresInDays) })}
        </Text>
      ) : null}

      {view.canDownload ? (
        <Pressable
          testID="export-download"
          accessibilityRole="button"
          style={styles.action}
          onPress={() => void download()}
        >
          <Text style={styles.actionText}>{t('dataExport.download')}</Text>
        </Pressable>
      ) : null}

      {linkError ? (
        <Text testID="export-link-error" style={styles.error}>
          {t('dataExport.linkFailed')}
        </Text>
      ) : null}
    </View>
  );
}

const makeStyles = (p: ReturnType<typeof usePalette>) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: touchTarget.checkbox,
      backgroundColor: p.surface,
      borderRadius: 12,
      padding: spacing.sm,
    },
    checkLabel: { flex: 1, gap: 2 },
    checkTitle: { fontFamily: fontFamily.bold, fontSize: typography.body.fontSize, color: p.text },
    checkBody: { fontSize: typography.caption.fontSize, color: p.muted },
    formatRow: { flexDirection: 'row', gap: spacing.sm },
    formatChip: {
      flex: 1,
      minHeight: touchTarget.checkbox,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: p.muted,
    },
    formatChipOn: { borderColor: p.primary, backgroundColor: p.primary + '14' },
    formatText: { fontSize: typography.body.fontSize, color: p.muted },
    formatTextOn: {
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      color: p.primary,
    },
    hint: { fontSize: typography.caption.fontSize, color: p.muted },
    error: { fontSize: typography.caption.fontSize, color: p.danger },
    codeInput: {
      minHeight: touchTarget.primaryButton,
      borderRadius: 12,
      backgroundColor: p.surface,
      color: p.text,
      textAlign: 'center',
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      letterSpacing: 8,
    },
    result: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
    resultTitle: {
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      color: p.text,
      textAlign: 'center',
    },
    resultBody: {
      fontSize: typography.body.fontSize,
      color: p.muted,
      textAlign: 'center',
    },
    action: {
      alignSelf: 'stretch',
      minHeight: touchTarget.primaryButton,
      marginTop: spacing.md,
      borderRadius: 12,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
    },
    actionOff: { opacity: 0.5 },
    actionText: {
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      color: p.onPrimary,
    },
  });
