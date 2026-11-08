'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '../../../../i18n';
import { formatMoney } from '../../../../lib/format';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CheckoutProps {
  amount?: number;
  transactionId?: string;
  invoiceId?: string;
  payeeName?: string;
}

/**
 * PromptPay / Thai QR Settlement screen for Web Desktop.
 * Converted directly from Stitch Screen b28493a31005468c91a366d69787d822.
 */
export default function CheckoutPage({
  amount = 1450200,
  transactionId = 'TX-8829-CON-41',
  invoiceId = 'INV-2024-004921',
  payeeName = 'Siam Masonry Infrastructure Ltd.',
}: CheckoutProps) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 minutes
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'promptpay' | 'bahtnet'>('promptpay');

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const handleSimulatePayment = () => {
    setPaymentSuccess(true);
    setTimeout(() => {
      router.push('/finance/payments');
    }, 2500);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0B1020] text-white">
      {/* Top Header */}
      <header className="w-full h-16 flex items-center justify-between px-8 bg-[#031427] border-b border-[#434655]/30">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold text-blue-500 tracking-wider">CONSTRUCTION OS</span>
          <div className="h-5 w-[1px] bg-slate-700" />
          <span className="text-base font-semibold text-slate-300">
            {t('checkout.headerTitle')}
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-emerald-400">
              verified_user
            </span>
            <span>{t('checkout.secureSession')}</span>
          </div>
          <Link
            href="/finance/payments"
            className="text-slate-400 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </Link>
        </div>
      </header>

      {/* Main Checkout Grid */}
      <main className="flex-1 flex flex-col md:flex-row w-full">
        {/* Left Section: Details & Payment Methods */}
        <section className="w-full md:w-1/2 p-8 lg:p-12 overflow-y-auto border-r border-[#434655]/20 flex flex-col justify-between">
          <div className="max-w-md w-full mx-auto space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">{t('checkout.title')}</h1>
              <p className="text-xs text-slate-400 font-mono">
                {t('checkout.transactionId')}:{' '}
                <span className="text-cyan-400">{transactionId}</span>
              </p>
            </div>

            {/* Summary Card */}
            <div className="bg-[#0b1c30] border border-[#434655]/40 rounded-xl p-6 relative overflow-hidden shadow-lg">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-600" />
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {t('checkout.validFor')} {formattedTime} {t('checkout.minutes')}
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">{payeeName}</h3>
                </div>
                <span className="bg-[#26364a] px-2.5 py-0.5 rounded text-[10px] font-bold text-cyan-400 border border-cyan-500/20 uppercase">
                  B2B Settlement
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-slate-700/40 text-xs">
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-medium">
                    Invoice ID
                  </span>
                  <p className="text-slate-200 font-mono mt-0.5">{invoiceId}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase text-slate-400 font-medium">Due Date</span>
                  <p className="text-slate-200 mt-0.5">Today (Immediate)</p>
                </div>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-700/40">
                <span className="text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                  {t('checkout.settlementAmount')}
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-extrabold text-white tracking-tight">
                    {formatMoney(locale, amount.toString(), 'THB')}
                  </span>
                  <span className="text-sm font-semibold text-slate-400">THB</span>
                </div>
              </div>
            </div>

            {/* Payment Method Channels */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {t('checkout.primaryChannel')}
              </h4>

              {/* PromptPay Channel */}
              <button
                type="button"
                onClick={() => setActiveChannel('promptpay')}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                  activeChannel === 'promptpay'
                    ? 'bg-blue-950/30 border-blue-600 shadow-md'
                    : 'bg-[#102034] border-slate-700/40 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center p-1.5 shadow-sm">
                    <span className="font-extrabold text-blue-800 text-xs tracking-tighter">
                      Prompt
                      <br />
                      Pay
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h5 className="font-bold text-sm text-white">{t('checkout.promptPay')}</h5>
                      <span className="bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                        B2B Verified
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{t('checkout.promptPayDesc')}</p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-blue-500">
                  {activeChannel === 'promptpay'
                    ? 'radio_button_checked'
                    : 'radio_button_unchecked'}
                </span>
              </button>

              {/* Corporate BAHTNET Channel */}
              <button
                type="button"
                onClick={() => setActiveChannel('bahtnet')}
                className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                  activeChannel === 'bahtnet'
                    ? 'bg-blue-950/30 border-blue-600'
                    : 'bg-[#102034] border-slate-700/40 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 bg-[#26364a] rounded-lg flex items-center justify-center">
                    <span className="material-symbols-outlined text-slate-300">
                      account_balance
                    </span>
                  </div>
                  <div>
                    <h5 className="font-bold text-sm text-white">Corporate BAHTNET</h5>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Real-time Gross Settlement (RTGS)
                    </p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-slate-500">
                  {activeChannel === 'bahtnet' ? 'radio_button_checked' : 'radio_button_unchecked'}
                </span>
              </button>
            </div>

            {/* Advisory Note */}
            <div className="p-3.5 rounded-lg bg-[#0b1c30] border border-cyan-900/40 flex gap-3 text-xs text-slate-300 leading-relaxed">
              <span className="material-symbols-outlined text-cyan-400 text-lg shrink-0 mt-0.5">
                info
              </span>
              <div>
                <strong className="text-cyan-300">Limit Advisory: </strong>
                Maximum ฿2,000,000 per transaction for Thai QR B2B channels. Settlement window is
                immediate to T+1.
              </div>
            </div>
          </div>
        </section>

        {/* Right Section: Dynamic QR Display & Live Status */}
        <section className="w-full md:w-1/2 p-8 lg:p-12 flex flex-col items-center justify-center relative bg-gradient-to-b from-[#031427] to-[#0B1020]">
          <div className="max-w-sm w-full text-center space-y-6 z-10">
            {/* QR Card Container */}
            <div className="relative group">
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-400 rounded-2xl blur opacity-25 group-hover:opacity-40 transition duration-700" />
              <div className="relative bg-white p-7 rounded-2xl shadow-2xl flex flex-col items-center text-slate-900">
                <div className="w-full flex justify-between items-center mb-4 px-1">
                  <span className="font-extrabold text-blue-900 tracking-tight text-sm">
                    THAI QR PAYMENT
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {formatMoney(locale, amount.toString(), 'THB')}
                  </span>
                </div>

                {/* QR Canvas with Scan line */}
                <div className="relative w-56 h-56 border-2 border-slate-100 rounded-xl overflow-hidden p-3 bg-white flex items-center justify-center">
                  <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 opacity-60 animate-pulse" />
                  {/* Styled QR Matrix Mockup */}
                  <div className="w-full h-full border-4 border-slate-900 rounded p-1 flex flex-col justify-between">
                    <div className="flex justify-between">
                      <div className="w-12 h-12 border-4 border-slate-900 rounded-sm p-1">
                        <div className="w-full h-full bg-slate-900" />
                      </div>
                      <div className="w-12 h-12 border-4 border-slate-900 rounded-sm p-1">
                        <div className="w-full h-full bg-slate-900" />
                      </div>
                    </div>
                    <div className="flex items-center justify-center">
                      <span className="bg-blue-900 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                        PROMPTPAY
                      </span>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="w-12 h-12 border-4 border-slate-900 rounded-sm p-1">
                        <div className="w-full h-full bg-slate-900" />
                      </div>
                      <div className="w-8 h-8 bg-slate-800 rounded-sm" />
                    </div>
                  </div>
                </div>

                <div className="mt-4 text-slate-500 font-mono text-[11px] uppercase tracking-wider font-semibold">
                  {t('checkout.validFor')} {formattedTime} {t('checkout.minutes')}
                </div>
              </div>
            </div>

            {/* Payment Waiting Status */}
            <div className="flex flex-col items-center space-y-2">
              {paymentSuccess ? (
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-base animate-bounce">
                  <span className="material-symbols-outlined text-xl">check_circle</span>
                  <span>{t('checkout.paymentReceived')}</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
                    <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                    <span>{t('checkout.waitingPayment')}</span>
                  </div>
                  <p className="text-xs text-slate-400 max-w-[280px]">
                    {t('checkout.scanInstructions')}
                  </p>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 w-full pt-2">
              <button
                type="button"
                onClick={handleSimulatePayment}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 text-sm"
              >
                <span className="material-symbols-outlined text-base">qr_code_scanner</span>
                {t('checkout.confirmSimulatedPayment')}
              </button>

              <Link
                href="/finance/payments"
                className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
              >
                {t('checkout.cancel')}
              </Link>
            </div>

            {/* Security Trust Badges */}
            <div className="pt-4 flex justify-center gap-8 text-slate-500 text-[10px] font-bold">
              <div className="flex flex-col items-center gap-1">
                <span className="material-symbols-outlined text-sm">shield_locked</span>
                <span>PCI-DSS</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="material-symbols-outlined text-sm">lock</span>
                <span>256-BIT SSL</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="material-symbols-outlined text-sm">verified</span>
                <span>BOT VERIFIED</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
