'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useI18n } from '../../../../i18n';
import { fill } from '../../../../i18n/fill';
import { formatMoney } from '../../../../lib/format';

/**
 * `useSearchParams()` makes everything up to its nearest <Suspense> boundary client-rendered, and
 * without a boundary `next build` cannot prerender the route ("missing-suspense-with-csr-bailout")
 * and stops. `?property=` and `?unit=` seed the whole form's initial state, so the boundary wraps
 * the whole wizard rather than one small reader (as `login/page.tsx` does). The fallback holds no
 * text, so it has nothing to translate.
 */
export default function LeaseWizardPage() {
  return (
    <Suspense fallback={<div className="flex flex-col h-full bg-[#020617]" />}>
      <LeaseWizard />
    </Suspense>
  );
}

/**
 * 5-Step Lease Setup & Execution Wizard.
 * Implements Stitch Screens d19b2a418dfb47a2b39048295f525734,
 * e465de965dbd4514b509231e7372f19e, and f33a5345c56943c887642f0c29e88827.
 */
function LeaseWizard() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();

  const propertyParam = searchParams.get('property') || 'vanguard-tower';
  const unitParam = searchParams.get('unit') || '10-4';

  const [step, setStep] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    property: propertyParam,
    unit: unitParam,
    unitAreaSqft: '4250',
    tenantLegalName: 'Siam Synergy Logistics Co., Ltd.',
    taxId: '0105558912341',
    signatoryName: 'Somchai Prasertkit',
    signatoryEmail: 'somchai.p@siamsynergy.com',
    leaseTermYears: '3',
    commencementDate: '2026-12-01',
    monthlyRent: '320000',
    escalationPercent: '5',
    serviceCharge: '45',
    securityDepositMonths: '3',
    paymentMethod: 'promptpay',
  });

  const totalMonthlyCommitment =
    parseFloat(formData.monthlyRent || '0') +
    parseFloat(formData.unitAreaSqft || '0') * parseFloat(formData.serviceCharge || '0');

  const securityDepositAmount =
    totalMonthlyCommitment * parseFloat(formData.securityDepositMonths || '3');

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      setIsSubmitting(true);
      setTimeout(() => {
        setIsSubmitting(false);
        setSuccessMessage(
          fill(t('leasing.wizard.success'), { unit: unitParam, tenant: formData.tenantLegalName }),
        );
        setTimeout(() => {
          router.push('/leasing');
        }, 2500);
      }, 1200);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] text-[#F8FAFC]">
      {/* Top Header */}
      <div className="px-6 py-4 flex flex-wrap justify-between items-center border-b border-white/5 bg-[#0F172A]/40 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/leasing"
              className="text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              {t('common.back')}
            </Link>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-500">description</span>
              {t('leasing.leaseAgreementWizard')}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/70 text-blue-400 border border-blue-800/40 font-mono">
              {fill(t('leasing.wizard.stepOf'), { step: String(step) })}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('leasing.wizard.subtitle')}</p>
        </div>
      </div>

      {successMessage && (
        <div className="mx-6 mt-4 p-4 rounded-xl bg-emerald-950/80 border border-emerald-600/50 text-emerald-300 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          {successMessage}
        </div>
      )}

      {/* Step Indicator */}
      <div className="px-6 pt-6">
        <div className="grid grid-cols-5 gap-2 max-w-4xl mx-auto">
          {[
            { num: 1, label: t('leasing.stepUnit') },
            { num: 2, label: t('leasing.stepTenant') },
            { num: 3, label: t('leasing.stepTerms') },
            { num: 4, label: t('leasing.stepDeposit') },
            { num: 5, label: t('leasing.stepSign') },
          ].map((st) => (
            <div key={st.num} className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${
                  step === st.num
                    ? 'bg-blue-600 text-white ring-2 ring-blue-400/40 ring-offset-2 ring-offset-[#020617]'
                    : step > st.num
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                }`}
              >
                {step > st.num ? (
                  <span className="material-symbols-outlined text-[16px]">check</span>
                ) : (
                  st.num
                )}
              </div>
              <span className="text-[11px] font-medium text-slate-400 mt-1.5 text-center">
                {st.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Form Content */}
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl w-full mx-auto">
        <div className="bg-[#0F172A] border border-white/5 rounded-2xl p-6 shadow-xl">
          {/* STEP 1: Unit Selection */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400">apartment</span>
                {t('leasing.wizard.step1Title')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label
                    htmlFor="target-property"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.targetProperty')}
                  </label>
                  <input
                    id="target-property"
                    type="text"
                    value={formData.property}
                    onChange={(e) => setFormData({ ...formData, property: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="unit-designation"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.unitDesignation')}
                  </label>
                  <input
                    id="unit-designation"
                    type="text"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="usable-area"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.usableArea')}
                  </label>
                  <input
                    id="usable-area"
                    type="number"
                    value={formData.unitAreaSqft}
                    onChange={(e) => setFormData({ ...formData, unitAreaSqft: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="space-class"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.spaceClass')}
                  </label>
                  <select
                    id="space-class"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option>{t('leasing.wizard.spaceGradeA')}</option>
                    <option>{t('leasing.wizard.spaceLogistics')}</option>
                    <option>{t('leasing.wizard.spaceRetail')}</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Tenant KYC */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400">badge</span>
                {t('leasing.wizard.step2Title')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="md:col-span-2">
                  <label
                    htmlFor="tenant-legal-name"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.legalEntity')}
                  </label>
                  <input
                    id="tenant-legal-name"
                    type="text"
                    value={formData.tenantLegalName}
                    onChange={(e) => setFormData({ ...formData, tenantLegalName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="tax-id"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.taxId')}
                  </label>
                  <input
                    id="tax-id"
                    type="text"
                    value={formData.taxId}
                    onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="signatory-name"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.signatoryName')}
                  </label>
                  <input
                    id="signatory-name"
                    type="text"
                    value={formData.signatoryName}
                    onChange={(e) => setFormData({ ...formData, signatoryName: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="signatory-email"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.signatoryEmail')}
                  </label>
                  <input
                    id="signatory-email"
                    type="email"
                    value={formData.signatoryEmail}
                    onChange={(e) => setFormData({ ...formData, signatoryEmail: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Commercial Terms */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400">payments</span>
                {t('leasing.wizard.step3Title')}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label
                    htmlFor="lease-duration"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.leaseDuration')}
                  </label>
                  <select
                    id="lease-duration"
                    value={formData.leaseTermYears}
                    onChange={(e) => setFormData({ ...formData, leaseTermYears: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="1">{t('leasing.wizard.term1')}</option>
                    <option value="2">{t('leasing.wizard.term2')}</option>
                    <option value="3">{t('leasing.wizard.term3')}</option>
                    <option value="5">{t('leasing.wizard.term5')}</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="commencement-date"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.commencementDate')}
                  </label>
                  <input
                    id="commencement-date"
                    type="date"
                    value={formData.commencementDate}
                    onChange={(e) => setFormData({ ...formData, commencementDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="monthly-rent"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.monthlyBaseRent')}
                  </label>
                  <input
                    id="monthly-rent"
                    type="number"
                    value={formData.monthlyRent}
                    onChange={(e) => setFormData({ ...formData, monthlyRent: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="escalation-percent"
                    className="block text-xs font-semibold text-slate-300 mb-1"
                  >
                    {t('leasing.wizard.escalationRate')}
                  </label>
                  <input
                    id="escalation-percent"
                    type="number"
                    value={formData.escalationPercent}
                    onChange={(e) =>
                      setFormData({ ...formData, escalationPercent: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Security Deposit */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400">account_balance</span>
                {t('leasing.wizard.step4Title')}
              </h2>

              <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/40 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300">{t('leasing.wizard.baseMonthlyRent')}</span>
                  <span className="font-mono font-bold text-white">
                    {formatMoney(locale, formData.monthlyRent, 'THB')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300">
                    {fill(t('leasing.wizard.commonAreaService'), {
                      rate: formData.serviceCharge,
                      area: formData.unitAreaSqft,
                    })}
                  </span>
                  <span className="font-mono font-bold text-white">
                    {formatMoney(
                      locale,
                      (
                        parseFloat(formData.unitAreaSqft) * parseFloat(formData.serviceCharge)
                      ).toString(),
                      'THB',
                    )}
                  </span>
                </div>
                <div className="border-t border-white/10 pt-2 flex justify-between items-center text-sm">
                  <span className="font-bold text-white">{t('leasing.wizard.totalDeposit')}</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {formatMoney(locale, securityDepositAmount.toString(), 'THB')}
                  </span>
                </div>
              </div>

              <div className="pt-2">
                <span className="block text-xs font-semibold text-slate-300 mb-2">
                  {t('leasing.wizard.settlementChannel')}
                </span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: 'promptpay' })}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                      formData.paymentMethod === 'promptpay'
                        ? 'border-blue-500 bg-blue-950/40 text-white'
                        : 'border-white/10 bg-slate-900/60 text-slate-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-blue-400">qr_code_2</span>
                    <div>
                      <p className="font-bold text-xs">{t('leasing.wizard.promptpayTitle')}</p>
                      <p className="text-[10px]">{t('leasing.wizard.promptpayDesc')}</p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, paymentMethod: 'directdebit' })}
                    className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                      formData.paymentMethod === 'directdebit'
                        ? 'border-blue-500 bg-blue-950/40 text-white'
                        : 'border-white/10 bg-slate-900/60 text-slate-400'
                    }`}
                  >
                    <span className="material-symbols-outlined text-emerald-400">sync_alt</span>
                    <div>
                      <p className="font-bold text-xs">{t('leasing.wizard.directDebitTitle')}</p>
                      <p className="text-[10px]">{t('leasing.wizard.directDebitDesc')}</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Review & Digital Sign */}
          {step === 5 && (
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-400">draw</span>
                {t('leasing.wizard.step5Title')}
              </h2>

              <div className="p-4 rounded-xl bg-slate-900/90 border border-white/5 space-y-3 text-xs">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">{t('leasing.wizard.propertyUnit')}</span>
                  <span className="font-bold text-white">
                    {fill(t('leasing.wizard.propertyUnitValue'), {
                      property: formData.property,
                      unit: formData.unit,
                      area: formData.unitAreaSqft,
                    })}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">{t('leasing.wizard.tenantLegalName')}</span>
                  <span className="font-bold text-white">{formData.tenantLegalName}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">{t('leasing.wizard.signatory')}</span>
                  <span className="font-bold text-white">
                    {formData.signatoryName} ({formData.signatoryEmail})
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-400">{t('leasing.wizard.leaseTerm')}</span>
                  <span className="font-bold text-white">
                    {fill(t('leasing.wizard.leaseTermValue'), {
                      years: formData.leaseTermYears,
                      date: formData.commencementDate,
                    })}
                  </span>
                </div>
                <div className="flex justify-between pt-1">
                  <span className="font-bold text-white">
                    {t('leasing.wizard.monthlyCommitment')}
                  </span>
                  <span className="font-mono font-bold text-cyan-400">
                    {fill(t('leasing.wizard.perMonth'), {
                      amount: formatMoney(locale, totalMonthlyCommitment.toString(), 'THB'),
                    })}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/30 flex items-center gap-2.5">
                <span className="material-symbols-outlined text-emerald-400 text-sm">
                  verified_user
                </span>
                <p className="text-[11px] text-emerald-200">{t('leasing.wizard.legalNotice')}</p>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="mt-8 pt-4 border-t border-white/5 flex justify-between items-center">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1 || isSubmitting}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-40"
            >
              {t('common.back')}
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md flex items-center gap-2"
            >
              {step === 5 ? (
                <>
                  <span className="material-symbols-outlined text-[16px]">draw</span>
                  {isSubmitting ? t('leasing.wizard.executing') : t('leasing.executeAgreement')}
                </>
              ) : (
                <>
                  {t('common.next')}
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
