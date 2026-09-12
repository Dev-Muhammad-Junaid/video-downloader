#!/usr/bin/env bash
#
# Publishes a built release to GitHub.
#
# Uploads latest-mac.yml alongside the .dmg. Nothing consumes it yet — the app
# checks the GitHub releases API directly — but electron-builder generates it
# on every build and it is exactly the manifest electron-updater will read once
# the app is code-signed and real auto-update is possible. Publishing it from
# the start means the update feed has continuous history rather than beginning
# at whichever version we happened to switch over on.
#
# It also carries a sha512 of the .dmg, so a download can be integrity-checked
# today by anyone who wants to.
#
# Usage: scripts/release.sh <version> "<title>" <notes-file>
set -euo pipefail

VERSION="${1:?usage: release.sh <version> <title> <notes-file>}"
TITLE="${2:?missing title}"
NOTES_FILE="${3:?missing notes file}"

# Every regression suite runs before anything is published. These exist because
# the same defects shipped repeatedly — media written inside the app bundle
# (five times), the library deleting its own rows, a video link downloading a
# 552-entry playlist. Publishing past a red suite is how those reach users, so
# it is not possible from here.
echo "Running tests before publishing..."
npm test --silent || { echo "error: tests failed — not publishing" >&2; exit 1; }
npx tsc --noEmit || { echo "error: typecheck failed — not publishing" >&2; exit 1; }
echo

DMG="dist/SnapDown-${VERSION}-arm64.dmg"
MANIFEST="dist/latest-mac.yml"
SIG="${DMG}.sig"

[ -f "$DMG" ] || { echo "error: $DMG not found — run 'npm run electron:build' first" >&2; exit 1; }
[ -f "$NOTES_FILE" ] || { echo "error: notes file $NOTES_FILE not found" >&2; exit 1; }

# Sign before publishing. The in-app updater REFUSES to install a release with
# no .sig, so an unsigned publish would silently strand every user on their
# current version — fail loudly here instead.
echo "Signing ${DMG}..."
node scripts/sign-release.cjs "$DMG"
[ -f "$SIG" ] || { echo "error: signing produced no $SIG" >&2; exit 1; }

ASSETS=("$DMG" "$SIG")
if [ -f "$MANIFEST" ]; then
    # Sanity check: a stale manifest from a previous build would advertise the
    # wrong version and hash.
    if grep -q "^version: ${VERSION}$" "$MANIFEST"; then
        ASSETS+=("$MANIFEST")
    else
        echo "warning: $MANIFEST is not for ${VERSION} — skipping it" >&2
    fi
fi

echo "Publishing v${VERSION} with: ${ASSETS[*]}"
gh release create "v${VERSION}" "${ASSETS[@]}" --title "$TITLE" --notes-file "$NOTES_FILE"
