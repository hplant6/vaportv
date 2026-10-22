# Changelog

What changed in each release of vaporTV. `scripts/release.sh` publishes a version's
section as its GitHub release notes, which is what the update window in vaporTV shows,
so write for the people using it: what's new, what's fixed. Start a version's section
as `## <version>` (as in package.json), then `### Added`, `### Fixed` or `### Changed`
groups of `- ` points. Collect changes under `## Unreleased` until then.

## Unreleased

### Added
- Updates: vaporTV checks for new versions, shows what changed in each one since yours, and installs it from the couch (Settings → General → Updates).
- Netflix's arrow-key controls install with the rest of setup (it asks for the admin password once, along with controller wake).
- A Sofabaton (or other remote) can open Steam's menu with F11, and its Home button closes apps.
- Kodi can be set up from the apps list, for watching an Emby library.
- Games and apps without artwork get a proper background behind their name instead of a blank card.

### Fixed
- Netflix: the arrows move between profiles on "Who's watching?".
- Kodi (and other apps vaporTV opens itself) no longer keep running unseen after you go back to vaporTV through Steam's menu.
