-- Rollback for 20260716000003_device_trust.
-- DESTRUCTIVE: drops every device-trust enrolment. Users are unaffected and simply lose the
-- "trusted device" indicator (every device reads as untrusted until re-enrolled); login is unaffected
-- because the OTP itself is the authenticator, not the device key.

DROP TABLE IF EXISTS platform.trusted_devices;
