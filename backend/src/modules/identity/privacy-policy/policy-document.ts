// The Privacy Policy, as the platform's own downloadable document (ADR-091, PDF decision 2026-08-17).
//
// WHY THE TEXT IS HERE AS WELL AS IN apps/mobile/src/i18n/en.json, AND WHAT KEEPS THEM HONEST.
// It is a second copy of legal prose, which is exactly the drift <PrivacyPolicyDocument /> was
// extracted to prevent — so it does not stand on discipline. `scripts/ci/check-policy-parity.mjs`
// reads BOTH this file and the mobile bundle on every CI lint run and fails when they disagree, on
// the version, the effective date, or any string. Two copies with a machine check between them is a
// different situation from two copies and a promise.
//
// It could not simply be imported. `apps/mobile` is a standalone pnpm workspace (Metro needs a hoisted
// node_modules, so `pnpm-workspace.yaml` excludes it) that consumes `@cos/*` as `file:` dependencies;
// its i18n bundles are app assets, not a shared package, and the backend has no path to them at
// runtime. Publishing the prose as a new `@cos/` package would put a legal document behind a build
// step in both workspaces and force a lockfile change in each — more moving parts than the check.
//
// ENGLISH ONLY, deliberately. StandardFonts.Helvetica in pdf-lib has no Thai glyphs: rendering the
// Thai bundle would emit an exception at best and a page of blanks at worst. A Thai PDF needs an
// embedded Thai face, which is a font-licensing decision nobody has taken — so the endpoint serves
// the English edition and says so, rather than shipping an unreadable Thai one.

/**
 * Effective version + date. MUST equal POLICY_VERSION / POLICY_EFFECTIVE_DATE in
 * apps/mobile/src/components/PrivacyPolicyDocument.tsx — the parity script asserts it, because a PDF
 * stamped v1.0.0 served beside a screen showing v1.1.0 is worse than no PDF at all.
 */
export const POLICY_VERSION = '1.0.0';
export const POLICY_EFFECTIVE_DATE = '2026-08-03';

/** The base file name; the served name appends the version. */
export const POLICY_FILE_STEM = 'COS_Privacy_Policy';

export interface PolicySection {
  /** Matches the section id in <PrivacyPolicyDocument />'s SECTIONS, so the parity check can pair them. */
  id: string;
  title: string;
  /** Paragraphs and list items in reading order. A leading '• ' marks a bullet. */
  lines: readonly string[];
}

export interface PolicyDocument {
  brandName: string;
  subtitle: string;
  complianceBadge: string;
  intro: string;
  sections: readonly PolicySection[];
  contactLabel: string;
  copyright: string;
}

/**
 * Every string below is the EXACT value of the matching `privacy.policy.*` key in
 * apps/mobile/src/i18n/en.json. Do not edit one without the other — the parity script will fail, and
 * it is meant to.
 */
export const POLICY_DOCUMENT: PolicyDocument = {
  brandName: 'Construction OS',
  subtitle: `Personal Data Protection Framework v${POLICY_VERSION}`,
  complianceBadge: 'Compliant with PDPA & GDPR',
  intro:
    'This policy explains what personal data Construction OS collects, how it is processed, and the rights you can exercise over it. It applies to the mobile app, the web app, and the platform services behind them.',
  sections: [
    {
      id: 'collection',
      title: 'Data Collection',
      lines: [
        'We collect only the personal data needed to run construction operations and to meet safety and legal obligations:',
        '• Identity — your full name, and your employee code on workforce records.',
        '• Contact — your phone number and email address, used for sign-in and notifications.',
        '• Location — GPS coordinates attached to check-in/check-out, daily site reports, issues, safety incidents and inspections. Coordinates are optional on every one of those records. Check-in coordinates are kept for 90 days and then reduced to a daily count; coordinates on the other records are kept for as long as the record itself.',
        '• Site photos — images attached to site reports and inspections. Faces may appear; no facial recognition is performed.',
        '• Payroll — your agreed daily rate on a project. No bank account details are stored.',
        "We do not collect biometric identifiers such as fingerprints or face scans, and we run no facial recognition on any image. Site photos may incidentally show a person's face; those images are protected by the same project access controls as the record they belong to. We also do not collect national ID numbers or dates of birth. The retention period for each data type is defined in our data retention policy.",
      ],
    },
    {
      id: 'usage',
      title: 'Data Usage',
      lines: [
        'Your data is used to operate your projects, to record safety and quality compliance, and to produce the reports your organisation relies on.',
        'Analytics run on aggregated figures and pseudonymous identifiers, and personal data is removed before any text is sent to an AI model.',
        'Processing takes place on our platform and with a limited set of service providers under data processing agreements: cloud infrastructure and storage, identity, edge protection, workflow, and the AI report service.',
        "Data is stored in your organisation's assigned home region — Thailand (ap-southeast-7) for Thai organisations, Ireland (eu-west-1) for EU organisations, and Singapore (ap-southeast-1) otherwise — with Singapore acting as the disaster-recovery region for Thai data. One exception: sign-in codes are delivered through an SMS gateway in Singapore, so your phone number reaches that gateway when you sign in.",
      ],
    },
    {
      id: 'compliance',
      title: 'PDPA & GDPR',
      lines: [
        'Under the Thai Personal Data Protection Act and the GDPR you may exercise the following rights:',
        '• Right to access — obtain a copy of the personal data we hold about you.',
        '• Right to portability — receive your data in a machine-readable format.',
        '• Right to erasure — have your identity data removed. Records subject to a legal retention period are anonymised rather than deleted.',
        '• Right to restrict processing — have processing of your data suspended.',
        'We respond to a verified request within 30 days.',
      ],
    },
    {
      id: 'security',
      title: 'Technical Security',
      lines: [
        'Personal data is protected by the following controls:',
        '• AES-256 encryption at rest, with keys held in cloud hardware security modules',
        '• AES-256-GCM field-level encryption for secrets',
        '• TLS 1.3 minimum on all public endpoints',
        '• Zero-trust service mesh with mutual TLS',
        '• Row-level security isolating each organisation',
        'Full control status, certificate references and our sub-processor list are published on our Trust Center.',
      ],
    },
    {
      id: 'rights',
      title: 'User Rights',
      lines: [
        'Change which notifications you receive in notification settings. Access, portability, erasure and restriction requests go to our DPO.',
        'Withdrawing consent for safety-related data collection may limit access to areas of a site where that data is required.',
      ],
    },
  ],
  contactLabel: 'Contact Data Protection Office',
  copyright: 'CONSTRUCTION OS, All rights reserved.',
};
