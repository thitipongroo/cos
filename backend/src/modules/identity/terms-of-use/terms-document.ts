// The Terms of Use, as the platform's own downloadable document (ADR-092).
//
// The same arrangement as its neighbour `../privacy-policy/policy-document.ts`, for the same reasons
// and with the same guard: the prose also lives in `apps/mobile/src/i18n/{en,th}.json`, because
// `apps/mobile` is a standalone pnpm workspace whose i18n bundles are app assets rather than a
// package the backend can import at runtime. Two copies of a legal document is drift waiting to
// happen, so `scripts/ci/check-legal-parity.mjs` reads BOTH on every CI lint run and fails the build
// when they disagree — on the version, the effective date, or any sentence.
//
// ENGLISH ONLY, deliberately, exactly as the policy is: pdf-lib's StandardFonts.Helvetica carries no
// Thai glyphs, and embedding a Thai face is a font-licensing decision nobody has taken. The metadata
// endpoint states this in `language` rather than leaving a Thai reader to discover it by opening the
// file.
//
// WHAT THE SCREEN HAS THAT THIS DOES NOT, and why. The two summary tiles (STATUS / AI USAGE) and the
// closing photograph with its "ZERO INCIDENT POLICY" caption are screen chrome — a status readout and
// a banner, neither of which is a clause anyone agrees to. A PDF of the terms carries the terms. The
// parity script compares what IS here, so leaving them out is a decision recorded once, not a gap
// that silently widens.

/**
 * Effective version + date. MUST equal TERMS_VERSION / TERMS_EFFECTIVE_DATE in
 * apps/mobile/src/app/(auth)/terms-of-use.tsx — the parity script asserts it, because a PDF stamped
 * v1.0.0 served beside a screen showing v1.1.0 is worse than no PDF at all.
 */
export const TERMS_VERSION = '1.0.0';
export const TERMS_EFFECTIVE_DATE = '2026-08-09';

/**
 * The base file name; the served name appends the version.
 *
 * The drawing (`mockup/mobile/01_authen/04_terms_of_use/02_terms_of_use_download`) prints
 * `COS_TERMS_STABLE.pdf` against "v4.2.0-STABLE". Neither belongs to any edition of this text — the
 * same finding that put `COS_Privacy_Policy_Oct2023.pdf` aside next door — so the file is named for
 * the version it actually is.
 */
export const TERMS_FILE_STEM = 'COS_Terms_of_Use';

export interface TermsClause {
  /** Matches the section id in (auth)/terms-of-use.tsx's SECTIONS, so the parity check can pair them. */
  id: string;
  title: string;
  body: string;
}

export interface TermsDocument {
  brandName: string;
  subtitle: string;
  intro: string;
  /** In the order the screen numbers them 01…06. The PDF prints the same numbers. */
  clauses: readonly TermsClause[];
  copyright: string;
}

/**
 * Every string below is the EXACT value of the matching `terms.*` key in
 * apps/mobile/src/i18n/en.json. Do not edit one without the other — the parity script will fail, and
 * it is meant to.
 */
export const TERMS_DOCUMENT: TermsDocument = {
  brandName: 'Construction OS',
  subtitle: `Terms of Use v${TERMS_VERSION}`,
  intro:
    'Please review the following legal requirements for operating within the Construction OS industrial ecosystem.',
  clauses: [
    {
      id: 'acceptance',
      title: 'Acceptance of Terms',
      body: 'By accessing or using the Construction OS platform, including all field-service modules, real-time safety tracking, and automated reporting systems, you acknowledge that you have read, understood, and agreed to be bound by these Terms of Use and our Privacy Policy.',
    },
    {
      id: 'license',
      title: 'Industrial Usage License',
      body: 'Construction OS grants you a non-exclusive, non-transferable, limited license to access and use the software solely for professional construction project management and site supervision. Use for benchmarking or competitive analysis is strictly prohibited.',
    },
    {
      id: 'responsibilities',
      title: 'User Responsibilities',
      body: 'Users must maintain active PPE compliance as logged within the Safety Module. Failure to report site incidents or intentional bypassing of the AI Safety Guardian will result in immediate platform restriction. You are responsible for ensuring all field data entered is accurate and representative of actual site conditions.',
    },
    {
      id: 'ownership',
      title: 'Data Ownership & IP',
      body: 'Project-specific data remains the property of the contracting entity. However, Construction OS retains ownership of the underlying algorithms, interface designs, and aggregated, anonymized industrial performance metrics used for system optimization.',
    },
    {
      id: 'liability',
      title: 'Limitation of Liability',
      body: 'Construction OS is a management tool and does not replace professional structural engineering or legal safety oversight. Construction OS is not liable for structural failures, site accidents, or financial losses resulting from incorrect data interpretation or sensor failure in extreme environmental conditions.',
    },
    {
      id: 'termination',
      title: 'Termination of Access',
      body: 'We reserve the right to suspend or terminate access without notice if security protocols are breached or if payment for enterprise-tier services remains outstanding for more than 30 business days.',
    },
  ],
  copyright: 'CONSTRUCTION OS, All rights reserved.',
};
