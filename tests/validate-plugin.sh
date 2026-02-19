#!/usr/bin/env bash
# Validates WordPress Expert plugin structure
# Run: bash tests/validate-plugin.sh

set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ERRORS=0

pass() { echo "  PASS: $1"; }
fail() { echo "  FAIL: $1"; ERRORS=$((ERRORS + 1)); }

echo "=== WordPress Expert Plugin Validation ==="
echo ""

# --- plugin.json ---
echo "Checking plugin.json..."

PLUGIN_JSON="$PLUGIN_ROOT/.claude-plugin/plugin.json"
if [ -f "$PLUGIN_JSON" ]; then
  if jq empty "$PLUGIN_JSON" 2>/dev/null; then
    pass "plugin.json is valid JSON"
  else
    fail "plugin.json is not valid JSON"
  fi
else
  fail "plugin.json not found at .claude-plugin/plugin.json"
fi

# --- config.json ---
echo "Checking config.json..."

CONFIG_JSON="$PLUGIN_ROOT/config.json"
if [ -f "$CONFIG_JSON" ]; then
  if jq empty "$CONFIG_JSON" 2>/dev/null; then
    pass "config.json is valid JSON"
  else
    fail "config.json is not valid JSON"
  fi
else
  fail "config.json not found"
fi

# --- Skills have SKILL.md ---
echo "Checking skill directories..."

for skill_dir in "$PLUGIN_ROOT"/skills/*/; do
  skill_name="$(basename "$skill_dir")"
  if [ -f "$skill_dir/SKILL.md" ]; then
    pass "$skill_name has SKILL.md"
  else
    fail "$skill_name is missing SKILL.md"
  fi
done

# --- SKILL.md frontmatter ---
echo "Checking SKILL.md frontmatter..."

for skill_md in "$PLUGIN_ROOT"/skills/*/SKILL.md; do
  skill_name="$(basename "$(dirname "$skill_md")")"

  # Check for frontmatter opening
  first_line="$(head -1 "$skill_md")"
  if [ "$first_line" != "---" ]; then
    fail "$skill_name/SKILL.md missing frontmatter (no opening ---)"
    continue
  fi

  # Extract frontmatter (between first and second ---)
  frontmatter="$(awk 'NR==1{next} /^---$/{exit} {print}' "$skill_md")"

  if echo "$frontmatter" | grep -q "^name:"; then
    pass "$skill_name/SKILL.md has name in frontmatter"
  else
    fail "$skill_name/SKILL.md missing 'name' in frontmatter"
  fi

  if echo "$frontmatter" | grep -q "^description:"; then
    pass "$skill_name/SKILL.md has description in frontmatter"
  else
    fail "$skill_name/SKILL.md missing 'description' in frontmatter"
  fi
done

# --- Commands have COMMAND.md ---
echo "Checking command directories..."

for cmd_dir in "$PLUGIN_ROOT"/commands/*/; do
  cmd_name="$(basename "$cmd_dir")"
  if [ -f "$cmd_dir/COMMAND.md" ]; then
    pass "$cmd_name has COMMAND.md"
  else
    fail "$cmd_name is missing COMMAND.md"
  fi
done

# --- Skills registered in plugin.json ---
echo "Checking skill registration in plugin.json..."

if [ -f "$PLUGIN_JSON" ] && jq empty "$PLUGIN_JSON" 2>/dev/null; then
  for skill_dir in "$PLUGIN_ROOT"/skills/*/; do
    skill_name="$(basename "$skill_dir")"
    if jq -e ".skills[\"$skill_name\"]" "$PLUGIN_JSON" >/dev/null 2>&1; then
      pass "$skill_name registered in plugin.json"
    else
      fail "$skill_name NOT registered in plugin.json"
    fi
  done
fi

# --- Commands registered in plugin.json ---
echo "Checking command registration in plugin.json..."

if [ -f "$PLUGIN_JSON" ] && jq empty "$PLUGIN_JSON" 2>/dev/null; then
  for cmd_dir in "$PLUGIN_ROOT"/commands/*/; do
    cmd_name="$(basename "$cmd_dir")"
    if jq -e ".commands[\"$cmd_name\"]" "$PLUGIN_JSON" >/dev/null 2>&1; then
      pass "$cmd_name registered in plugin.json"
    else
      fail "$cmd_name NOT registered in plugin.json"
    fi
  done
fi

# --- Security checks ---
echo "Checking security..."

if git -C "$PLUGIN_ROOT" ls-files --error-unmatch sites.json >/dev/null 2>&1; then
  fail "sites.json is tracked by git (should be gitignored)"
else
  pass "sites.json is not tracked by git"
fi

env_files="$(git -C "$PLUGIN_ROOT" ls-files '*.env' '.env' '**/.env' 2>/dev/null || true)"
if [ -z "$env_files" ]; then
  pass "No .env files tracked by git"
else
  fail ".env file(s) tracked by git: $env_files"
fi

# --- Summary ---
echo ""
echo "=== Validation Complete ==="
if [ "$ERRORS" -eq 0 ]; then
  echo "All checks passed."
  exit 0
else
  echo "$ERRORS check(s) failed."
  exit 1
fi
