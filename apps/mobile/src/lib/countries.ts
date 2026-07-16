// Phone country picker data for the mobile OTP login (§20.6.1 Path A). Scope: the markets COS
// operates in — Thailand (home), Singapore and Vietnam. Flags are inline SVG strings (from the MIT flag-icons
// set), rendered via react-native-svg <SvgXml> — fully bundled, no network. Dial codes are E.164.

export interface Country {
  iso2: string;
  dialCode: string;
  nameEn: string;
  nameTh: string;
  /**
   * Digits a user types in the national format, including any leading trunk "0" \u2014 used to cap and
   * validate the phone field. TH mobile "081-234-5678" = 10; VN "091-234-5678" = 10; SG "8123 4567" =
   * 8 (no trunk prefix). `toE164` strips the trunk 0 before assembling the E.164 number.
   */
  nationalDigits: number;
}

export const COUNTRIES: Country[] = [
  {
    iso2: 'th',
    dialCode: '+66',
    nameEn: 'Thailand',
    nameTh: '\u0e44\u0e17\u0e22',
    nationalDigits: 10,
  },
  {
    iso2: 'vn',
    dialCode: '+84',
    nameEn: 'Vietnam',
    nameTh: '\u0e40\u0e27\u0e35\u0e22\u0e14\u0e19\u0e32\u0e21',
    nationalDigits: 10,
  },
  {
    iso2: 'sg',
    dialCode: '+65',
    nameEn: 'Singapore',
    nameTh: '\u0e2a\u0e34\u0e07\u0e04\u0e42\u0e1b\u0e23\u0e4c',
    nationalDigits: 8,
  },
];

export const DEFAULT_COUNTRY_ISO2 = 'th';

/** Inline flag SVG markup keyed by iso2, for <SvgXml xml={FLAG_SVG[iso2]} />. */
export const FLAG_SVG: Record<string, string> = {
  th: '<svg xmlns="http://www.w3.org/2000/svg" id="flag-icons-th" viewBox="0 0 640 480">\n  <g fill-rule="evenodd">\n    <path fill="#f4f5f8" d="M0 0h640v480H0z"/>\n    <path fill="#2d2a4a" d="M0 162.5h640v160H0z"/>\n    <path fill="#a51931" d="M0 0h640v82.5H0zm0 400h640v80H0z"/>\n  </g>\n</svg>',
  vn: '<svg xmlns="http://www.w3.org/2000/svg" id="flag-icons-vn" viewBox="0 0 640 480">\n  <defs>\n    <clipPath id="vn-a">\n      <path fill-opacity=".7" d="M-85.3 0h682.6v512H-85.3z"/>\n    </clipPath>\n  </defs>\n  <g fill-rule="evenodd" clip-path="url(#vn-a)" transform="translate(80)scale(.9375)">\n    <path fill="#da251d" d="M-128 0h768v512h-768z"/>\n    <path fill="#ff0" d="M349.6 381 260 314.3l-89 67.3L204 272l-89-67.7 110.1-1 34.2-109.4L294 203l110.1.1-88.5 68.4 33.9 109.6z"/>\n  </g>\n</svg>',
  sg: '<svg xmlns="http://www.w3.org/2000/svg" id="flag-icons-sg" viewBox="0 0 640 480">\n  <defs>\n    <clipPath id="sg-a">\n      <path fill-opacity=".7" d="M0 0h640v480H0z"/>\n    </clipPath>\n  </defs>\n  <g fill-rule="evenodd" clip-path="url(#sg-a)">\n    <path fill="#fff" d="M-20 0h720v480H-20z"/>\n    <path fill="#df0000" d="M-20 0h720v240H-20z"/>\n    <path fill="#fff" d="M146 40.2a84.4 84.4 0 0 0 .8 165.2 86 86 0 0 1-106.6-59 86 86 0 0 1 59-106c16-4.6 30.8-4.7 46.9-.2z"/>\n    <path fill="#fff" d="m133 110 4.9 15-13-9.2-12.8 9.4 4.7-15.2-12.8-9.3 15.9-.2 5-15 5 15h15.8zm17.5 52 5 15.1-13-9.2-12.9 9.3 4.8-15.1-12.8-9.4 15.9-.1 4.9-15.1 5 15h16zm58.5-.4 4.9 15.2-13-9.3-12.8 9.3 4.7-15.1-12.8-9.3 15.9-.2 5-15 5 15h15.8zm17.4-51.6 4.9 15.1-13-9.2-12.8 9.3 4.8-15.1-12.9-9.4 16-.1 4.8-15.1 5 15h16zm-46.3-34.3 5 15.2-13-9.3-12.9 9.4 4.8-15.2-12.8-9.4 15.8-.1 5-15.1 5 15h16z"/>\n  </g>\n</svg>',
};

export function findCountry(iso2: string): Country {
  return COUNTRIES.find((c) => c.iso2 === iso2) ?? COUNTRIES[0]!;
}

/**
 * Combine a dial code + national number into E.164 (^\+[1-9]\d{7,14}$): strip separators and a
 * leading trunk "0" (e.g. TH "081-234-5678" -> "+66812345678").
 */
export function toE164(dialCode: string, nationalNumber: string): string {
  const digits = nationalNumber.replace(/\D/g, '').replace(/^0+/, '');
  return `${dialCode}${digits}`;
}

/** Map a device region code (e.g. "TH", "SG") to an in-list iso2; fallback to the home market. */
export function countryFromRegion(region: string | null | undefined): string {
  const r = region?.toLowerCase();
  if (r && COUNTRIES.some((c) => c.iso2 === r)) return r;
  return DEFAULT_COUNTRY_ISO2;
}
