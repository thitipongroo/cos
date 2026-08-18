# Changelog

All notable changes to Construction OS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Terms of Use PDF + download receipt (ADR-092) — public `GET /api/v1/terms/metadata` and
  `GET /api/v1/terms/pdf` serve a byte-stable document; the mobile pre-auth screen's DOWNLOAD PDF
  button is live and pushes `(auth)/terms-of-use-downloaded`, which verifies the digest the server
  published against the bytes that landed. Reverses the 2026-08-09 decision to render it disabled.
- Phase 1: Foundation repository — monorepo scaffold, shared packages, local dev stack
