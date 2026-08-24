// Ambient declarations for the @digitalbazaar W3C DID/VC stack (ADR-019) — these packages ship no
// TypeScript types. Typed as `any` at the module boundary; CredentialService wraps them behind a
// typed interface.
declare module '@digitalbazaar/vc';
declare module '@digitalbazaar/ed25519-signature-2020';
declare module '@digitalbazaar/ed25519-verification-key-2020';
declare module '@digitalbazaar/did-method-key';
declare module '@digitalbazaar/did-method-web';
declare module '@digitalbazaar/did-io';
declare module '@digitalbazaar/vc-status-list';
declare module '@digitalbazaar/vc-status-list-context';
declare module '@digitalbazaar/security-document-loader';
declare module 'jsonld';
