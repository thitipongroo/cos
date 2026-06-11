// CJS stub for @keycloak/keycloak-admin-client.
// The package ships ESM-only; Jest runs in CJS mode and cannot parse it.
// Tests that use KeycloakAdminService construct jest.Mocked instances directly
// and never call through to the real KcAdminClient — this stub satisfies the
// import without crashing the Jest loader.
const KcAdminClient = jest.fn().mockImplementation(() => ({
  auth: jest.fn().mockResolvedValue(undefined),
  users: {
    create: jest.fn().mockResolvedValue({ id: 'stub-kc-id' }),
    del: jest.fn().mockResolvedValue(undefined),
    resetPassword: jest.fn().mockResolvedValue(undefined),
  },
}));

module.exports = KcAdminClient;
module.exports.default = KcAdminClient;
