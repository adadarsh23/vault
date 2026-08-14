# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project follows semantic
versioning where practical.

## [Unreleased]

### Changed

- Chat Vault UI now aligns with Notes Vault visual language while preserving existing chat behavior.
  - Matched layout structure, spacing scale, card treatment, rounded surfaces, and section headers.
  - Unified pill/button styling, list item appearance, empty-state presentation, and mobile controls.
  - Kept chat data flow, encryption/storage paths, and interaction logic unchanged.

## [1.0.0] - 2026-03-23

### Added

- Production-oriented package scripts and metadata in `package.json`
- Stronger auth/session handling, including revoked-session enforcement
- Registration metadata capture with multi-provider IP/profile lookups
- Expanded Settings UI with profile, maintenance, session, and preview sections
