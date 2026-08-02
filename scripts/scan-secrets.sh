#!/usr/bin/env bash
# Secret scanner for the iesports repo.
#
# Two modes:
#   ./scripts/scan-secrets.sh          scan what is staged (used by the pre-commit hook)
#   ./scripts/scan-secrets.sh --all    scan every file tracked in the working tree
#   ./scripts/scan-secrets.sh --history scan the full git history (slow)
#
# Exits non-zero when something looks like a credential, so it can block a
# commit. False positives are expected occasionally — see ALLOWLIST below.

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

MODE="${1:-staged}"

# Patterns that indicate a real credential rather than a placeholder.
# Deliberately excludes bare "AIza..." Firebase WEB api keys: those are public
# by design (they identify the project, they do not authorise anything) and are
# meant to ship in client bundles. Firestore rules are what protect that data.
PATTERNS='-----BEGIN [A-Z ]*PRIVATE KEY-----
RGAPI-[0-9a-f]{8}-
HDEV-[0-9a-f]{8}-
xox[baprs]-[0-9A-Za-z-]{20,}
gh[pousr]_[0-9A-Za-z]{30,}
sk_live_[0-9A-Za-z]{20,}
AKIA[0-9A-Z]{16}
(ADMIN_SECRET|PAYU_[A-Z_]*(KEY|SALT)|DISCORD_BOT_TOKEN|STEAM_API_KEY|FIREBASE_PRIVATE_KEY)[[:space:]]*[:=][[:space:]]*["'"'"']?[A-Za-z0-9/+_-]{12,}'

# Lines that legitimately contain the shape of a secret: documentation showing
# the format, and .env.example files whose values are literally "...".
ALLOWLIST='docs/|\.env\.example|CLAUDE\.md|scan-secrets\.sh|\.\.\.'

case "$MODE" in
  --all)     FILES=$(git ls-files) ;;
  --history) FILES="" ;;
  *)         FILES=$(git diff --cached --name-only --diff-filter=ACM) ;;
esac

fail=0

# Any .env file being committed is wrong regardless of content — the only safe
# rule is that they never enter the index at all.
if [ "$MODE" != "--history" ]; then
  for f in $FILES; do
    case "$(basename "$f")" in
      .env|.env.*)
        [ "$(basename "$f")" = ".env.example" ] && continue
        echo "BLOCKED  $f  — env files must never be committed"
        fail=1
        ;;
    esac
  done
fi

scan_content() {
  while IFS= read -r pattern; do
    [ -z "$pattern" ] && continue
    if [ "$MODE" = "--history" ]; then
      hits=$(git grep -I -n -E "$pattern" $(git rev-list --all) -- 2>/dev/null | grep -Ev "$ALLOWLIST" | head -5)
    else
      [ -z "$FILES" ] && return
      hits=$(grep -I -n -E "$pattern" $FILES 2>/dev/null | grep -Ev "$ALLOWLIST" | head -5)
    fi
    if [ -n "$hits" ]; then
      echo "BLOCKED  possible credential matching /$pattern/:"
      echo "$hits" | sed 's/^/         /'
      fail=1
    fi
  done <<< "$PATTERNS"
}
scan_content

if [ "$fail" -ne 0 ]; then
  echo
  echo "Commit blocked. If this is a false positive, add the file to ALLOWLIST"
  echo "in scripts/scan-secrets.sh, or commit with --no-verify and explain why."
  exit 1
fi

echo "scan-secrets: clean"
exit 0
