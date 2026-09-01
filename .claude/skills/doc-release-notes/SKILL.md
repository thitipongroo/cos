---
name: doc-release-notes
description: Write release notes that tell users what changed and what they must do about it. Use at every release, and always when something breaks compatibility.
allowed-tools:
  - "Read"
  - "Glob"
  - "Grep"
  - "Write"
  - "Bash"
---

# Release Notes

Written for the person deciding whether to upgrade, and what it will cost them.

## Structure

```
## <version> - <date>

### Breaking changes
### Added
### Changed
### Fixed
### Deprecated
```

Breaking changes go first, always. A breaking change discovered in the *Fixed*
section is a breaking change discovered in production.

## Per entry

- **What changed**, in terms of what the user sees - not the internal component
  that was refactored
- **What they must do**, for anything breaking or deprecated. Give the migration
  step or link to it
- **Why**, in one clause, when the change will surprise people

## Rules

- **Never ship a breaking change unannounced**, and never describe one as an
  improvement
- **A deprecation states its removal version and date.** A deprecation with no
  end date is ignored
- **No internal jargon, no ticket numbers as the only description.** "Fixed
  PROJ-4821" tells the reader nothing
- **Omit changes with no user-visible effect.** Refactors and dependency bumps
  belong in the commit log
- Derive the list from the actual diff or tag range, not from memory of the sprint

## Before publishing

Check every migration step you told people to take actually works on the released
build.
