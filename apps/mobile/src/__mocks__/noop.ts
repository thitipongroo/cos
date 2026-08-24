// An empty module, for side-effect-only imports that must not run under jest.
//
// Used by jest.config.ts's moduleNameMapper for `@formatjs/intl-pluralrules/*`: that polyfill exists
// for Hermes (partial Intl, no PluralRules), while Node already has full ICU — and its published
// files are ESM this CommonJS ts-jest setup cannot parse. See the mapper's own comment for why
// stubbing it costs no coverage of the thing it protects.
export {};
