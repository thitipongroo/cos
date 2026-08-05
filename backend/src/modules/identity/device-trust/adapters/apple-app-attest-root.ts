// Apple's App Attest root CA — PINNED, not fetched at runtime (ADR-082).
//
// Downloaded once from https://www.apple.com/certificateauthority/Apple_App_Attestation_Root_CA.pem
// and committed here. Fetching a trust anchor over the network at verification time would mean the
// thing that decides what to trust is itself decided by whatever answered the request — and a
// backend that cannot reach apple.com would either fail closed (locking out iOS enrolment) or fail
// open (trusting anything). A pinned constant does neither.
//
// Verified on download, 2026-08-05:
//   subject/issuer  CN=Apple App Attestation Root CA, O=Apple Inc., ST=California (self-signed)
//   validity        2020-03-18 -> 2045-03-15
//   signature       ECDSA / SHA-384
//   SHA-256(DER)    1cb9823ba28ba6ad2d33a006941de2ae4f513ef1d4e831b9f7e0fa7b6242c932
//
// The fingerprint is asserted in the test suite, so replacing this PEM with a different certificate
// fails the build rather than silently moving the trust anchor.
export const APPLE_APP_ATTEST_ROOT_CA_SHA256 =
  '1cb9823ba28ba6ad2d33a006941de2ae4f513ef1d4e831b9f7e0fa7b6242c932';

export const APPLE_APP_ATTEST_ROOT_CA_PEM = `-----BEGIN CERTIFICATE-----
MIICITCCAaegAwIBAgIQC/O+DvHN0uD7jG5yH2IXmDAKBggqhkjOPQQDAzBSMSYw
JAYDVQQDDB1BcHBsZSBBcHAgQXR0ZXN0YXRpb24gUm9vdCBDQTETMBEGA1UECgwK
QXBwbGUgSW5jLjETMBEGA1UECAwKQ2FsaWZvcm5pYTAeFw0yMDAzMTgxODMyNTNa
Fw00NTAzMTUwMDAwMDBaMFIxJjAkBgNVBAMMHUFwcGxlIEFwcCBBdHRlc3RhdGlv
biBSb290IENBMRMwEQYDVQQKDApBcHBsZSBJbmMuMRMwEQYDVQQIDApDYWxpZm9y
bmlhMHYwEAYHKoZIzj0CAQYFK4EEACIDYgAERTHhmLW07ATaFQIEVwTtT4dyctdh
NbJhFs/Ii2FdCgAHGbpphY3+d8qjuDngIN3WVhQUBHAoMeQ/cLiP1sOUtgjqK9au
Yen1mMEvRq9Sk3Jm5X8U62H+xTD3FE9TgS41o0IwQDAPBgNVHRMBAf8EBTADAQH/
MB0GA1UdDgQWBBSskRBTM72+aEH/pwyp5frq5eWKoTAOBgNVHQ8BAf8EBAMCAQYw
CgYIKoZIzj0EAwMDaAAwZQIwQgFGnByvsiVbpTKwSga0kP0e8EeDS4+sQmTvb7vn
53O5+FRXgeLhpJ06ysC5PrOyAjEAp5U4xDgEgllF7En3VcE3iexZZtKeYnpqtijV
oyFraWVIyd/dganmrduC1bmTBGwD
-----END CERTIFICATE-----`;
