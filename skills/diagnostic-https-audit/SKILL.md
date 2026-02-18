---
name: diagnostic-https-audit
description: Audits HTTPS/SSL configuration for WordPress sites — checks siteurl/home URL schemes and FORCE_SSL_ADMIN via WP-CLI (when available), and scans all PHP/JS files for hardcoded http:// mixed-content URLs in local codebase.
---

# Diagnostic Skill: HTTPS/SSL Configuration Audit

You audit a WordPress site's HTTPS configuration to detect mixed content risks, unforced SSL on the admin panel, and hardcoded non-HTTPS URLs in code.

## Why HTTPS Misconfigurations Matter

HTTPS misconfigurations create several risks:

1. **Mixed content** — Pages served over HTTPS loading resources (scripts, images, stylesheets) over HTTP trigger browser security warnings and may be blocked entirely, breaking site functionality.
2. **Admin panel not SSL-enforced** — WordPress admin credentials sent over HTTP can be intercepted by network eavesdroppers (coffee shops, corporate networks, etc.).
3. **Hardcoded http:// URLs in code** — Plugin or theme code referencing http:// asset URLs will cause mixed content warnings even on SSL-configured sites.

## Dual-Gated Architecture

This skill has two independently-gated sections:

- **Part A (WP-CLI config checks):** Runs ONLY when `WP_CLI_AVAILABLE=true`. Reads live WordPress configuration values from the database.
- **Part B (code grep):** Runs for ANY source type that has `LOCAL_PATH` set. Scans synced PHP and JS files for hardcoded `http://` URLs.

This skill is NOT in the `WP_CLI_SKILLS` array — it manages its own gating internally because Part B runs independently of WP-CLI availability.

## Connection Setup

```bash
SITE_NAME="${1:-default-site}"
PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)

HOST=$(echo "$PROFILE" | jq -r '.host // empty')
USER=$(echo "$PROFILE" | jq -r '.user // empty')
WP_PATH=$(echo "$PROFILE" | jq -r '.wp_path // empty')
LOCAL_PATH=$(echo "$PROFILE" | jq -r '.local_path // empty')
SOURCE_TYPE=$(echo "$PROFILE" | jq -r '.source_type // "ssh"')
WP_CLI_AVAILABLE=$(echo "$PROFILE" | jq -r '.wp_cli_available // "false"')
WP_CLI_PREFIX=$(echo "$PROFILE" | jq -r '.wp_cli_prefix // empty')
```

---

## Part A: WP-CLI Config Checks (WP_CLI_AVAILABLE=true only)

```bash
if [ "$WP_CLI_AVAILABLE" == "true" ]; then
```

### Check 1: siteurl Scheme

**Risk:** If siteurl is http://, WordPress serves pages over HTTP, defeating SSL even if the server has a certificate.

```bash
SITEURL=$($WP_CLI_PREFIX option get siteurl 2>/dev/null | tr -d '[:space:]')
```

**If siteurl starts with `http://`:** Generate Warning finding `INFR-HTTPS-URL`.

**Finding:**
```json
{
  "id": "INFR-HTTPS-URL",
  "severity": "Warning",
  "category": "Infrastructure",
  "title": "WordPress URL not configured for HTTPS",
  "summary": "The WordPress site URL and/or home URL are set to http://, which means the site serves pages over unencrypted HTTP even if an SSL certificate is installed",
  "detail": "The WordPress 'siteurl' option is set to: {SITEURL}. {HOME_URL_DETAIL} WordPress uses these values to generate all page URLs, asset references, and redirects. When set to http://, the site will not use HTTPS even if the server has a valid SSL certificate. This causes: (1) User data transmitted unencrypted, (2) Mixed content warnings if any assets reference https://, (3) Modern browsers flagging the site as 'Not Secure'. The fix requires updating these values in WordPress settings or wp-config.php.",
  "location": "WordPress database options: siteurl, home",
  "fix": "Update the WordPress URLs to HTTPS: In WordPress Admin go to Settings > General and change both 'WordPress Address (URL)' and 'Site Address (URL)' from http:// to https://. Alternatively via WP-CLI: `wp option update siteurl 'https://yourdomain.com'` and `wp option update home 'https://yourdomain.com'`. Ensure your SSL certificate is valid before making this change. After updating, test that the site loads correctly at the https:// URL."
}
```

### Check 2: home URL Scheme

**Risk:** Same as siteurl — both values must use https:// for complete HTTPS configuration.

```bash
HOME_URL=$($WP_CLI_PREFIX option get home 2>/dev/null | tr -d '[:space:]')
```

**Evaluation:** If both siteurl and home URL are http://, include both URLs in the `INFR-HTTPS-URL` finding detail field (combine into a single finding rather than emitting two). If only home URL is http://, still use `INFR-HTTPS-URL` but update detail to reference home URL specifically.

The `{HOME_URL_DETAIL}` placeholder in the finding above should be replaced with:
- If home URL also http://: `"The 'home' option is also set to: {HOME_URL}."`
- If home URL is https://: `""` (omit)

### Check 3: FORCE_SSL_ADMIN

**Risk:** Without FORCE_SSL_ADMIN, WordPress admin login and session cookies can be transmitted over HTTP, even when siteurl uses HTTPS.

```bash
FORCE_SSL_ADMIN=$($WP_CLI_PREFIX config get FORCE_SSL_ADMIN 2>/dev/null | tr -d '[:space:]')
```

**If FORCE_SSL_ADMIN is not set, empty string, "false", or "0":** Generate Info finding `INFR-HTTPS-SSL`.

**Finding:**
```json
{
  "id": "INFR-HTTPS-SSL",
  "severity": "Info",
  "category": "Infrastructure",
  "title": "FORCE_SSL_ADMIN not enabled",
  "summary": "The WordPress admin panel does not explicitly force HTTPS connections, which may allow admin credentials to be transmitted over HTTP",
  "detail": "The FORCE_SSL_ADMIN constant is not set to true in wp-config.php (current value: {FORCE_SSL_ADMIN_VALUE}). This constant forces WordPress to redirect all admin panel requests to HTTPS, ensuring login credentials and session cookies are never transmitted over unencrypted HTTP. Without it, if a user manually navigates to http://yourdomain.com/wp-admin/, their credentials may be sent unencrypted. Note: If your server already enforces HTTPS via redirect (e.g., .htaccess or server config), this is a belt-and-suspenders measure — still recommended for defense in depth.",
  "location": "wp-config.php (FORCE_SSL_ADMIN constant)",
  "fix": "Add the following line to wp-config.php before the '/* That\\'s all, stop editing! */' comment: `define('FORCE_SSL_ADMIN', true);` This forces all WordPress admin panel requests to use HTTPS, protecting login credentials even if server-level HTTPS enforcement is misconfigured."
}
```

### WP-CLI Not Available Note

```bash
else
  echo "INFO: WP-CLI config checks skipped — source type does not support WP-CLI. Mixed content code scan ran on local files."
fi
```

When WP_CLI_AVAILABLE=false, include this note in the findings output but do not generate a finding for it — it is context for the analyst, not a site issue.

---

## Part B: Mixed Content Code Grep (runs when LOCAL_PATH is set)

This section runs independently of WP-CLI availability. It requires only that LOCAL_PATH is set (i.e., the codebase has been synced locally).

```bash
if [ -n "$LOCAL_PATH" ] && [ -d "$LOCAL_PATH" ]; then
```

### Grep for Hardcoded http:// URLs

Scans all PHP and JS files for hardcoded `http://` references that would cause mixed content when the site runs over HTTPS.

```bash
HTTP_MATCHES=$(grep -rn \
  --include="*.php" --include="*.js" \
  --exclude-dir=".git" --exclude-dir="node_modules" --exclude-dir="vendor" \
  "http://[a-zA-Z0-9][a-zA-Z0-9.-]*\." \
  "$LOCAL_PATH/" 2>/dev/null | \
  grep -v "^\s*[*/#]" | \
  grep -v "localhost\|127\.0\.0\." | \
  grep -v "example\.com\|example\.org\|example\.net" | \
  grep -v "php\.net\|wordpress\.org\|w3\.org\|ietf\.org" | \
  grep -v "http://schemas\.\|http://www\.w3\." | \
  head -50)

HTTP_COUNT=$(echo "$HTTP_MATCHES" | grep -c "." 2>/dev/null || echo 0)
```

**False-positive filters applied:**
- Lines starting with comment markers (`*`, `#`, `/`) — documentation strings
- `localhost` and `127.0.0.x` — local development references
- `example.com`, `example.org`, `example.net` — placeholder/documentation domains
- `php.net`, `wordpress.org`, `w3.org`, `ietf.org` — official documentation links
- `http://schemas.` and `http://www.w3.` — XML namespace declarations (not real URLs)

**If count > 0:** Generate Warning finding `INFR-HTTPS-MXD`.

Extract the first 5 file:line examples:
```bash
EXAMPLES=$(echo "$HTTP_MATCHES" | head -5 | sed "s|$LOCAL_PATH/||")
```

**Finding:**
```json
{
  "id": "INFR-HTTPS-MXD",
  "severity": "Warning",
  "category": "Infrastructure",
  "title": "Hardcoded http:// URLs found in PHP/JS files",
  "summary": "Found {HTTP_COUNT} hardcoded http:// URL references in theme or plugin code that will cause mixed content warnings on HTTPS sites",
  "detail": "Code scan of {LOCAL_PATH} found {HTTP_COUNT} non-comment lines containing hardcoded http:// URLs (excluding localhost, documentation sites, and XML namespaces). These URLs will cause mixed content warnings or errors in modern browsers when the site runs over HTTPS. First 5 examples:\n{EXAMPLES}\n\nMixed content issues can cause: (1) Browser security warnings that erode user trust, (2) Blocked resources (scripts/styles) in strict browser security modes, (3) Broken functionality in browser extensions that enforce HTTPS-only. Note: Not all matches may be actively loaded URLs — review each occurrence to confirm it is a runtime-loaded resource.",
  "location": "Local codebase ({LOCAL_PATH}), {HTTP_COUNT} occurrences in PHP/JS files",
  "fix": "For each hardcoded http:// URL found: (1) If referencing your own domain — update to https:// or use a protocol-relative URL (//yourdomain.com/path) which inherits the page's scheme. (2) If referencing a CDN or third-party — check if they support HTTPS (most do) and update to https://. (3) If using WordPress asset functions, use `plugins_url()`, `get_template_directory_uri()`, or `content_url()` which automatically use the correct scheme based on WordPress configuration. Run the grep command again after fixes to confirm all instances resolved."
}
```

**If count = 0:** No INFR-HTTPS-MXD finding is emitted. Proceed to overall status evaluation.

```bash
fi
```

---

## Overall Status Finding

If **no issues** were found across both Part A and Part B (siteurl is https://, home URL is https://, FORCE_SSL_ADMIN is true, and no http:// code references), emit a single Info finding:

**Finding:**
```json
{
  "id": "INFR-HTTPS-OK",
  "severity": "Info",
  "category": "Infrastructure",
  "title": "HTTPS configuration healthy",
  "summary": "WordPress URLs use HTTPS, FORCE_SSL_ADMIN is enabled, and no hardcoded http:// URLs found in PHP/JS files",
  "detail": "All HTTPS configuration checks passed: (1) WordPress siteurl option uses https://, (2) WordPress home option uses https://, (3) FORCE_SSL_ADMIN is set to true in wp-config.php, (4) No hardcoded http:// URLs found in PHP/JS codebase (after filtering documentation and localhost references). The site's HTTPS configuration appears correctly set up.",
  "location": "WordPress configuration and codebase",
  "fix": "No action required — HTTPS configuration is healthy."
}
```

Note: INFR-HTTPS-OK is only emitted when WP-CLI checks ran AND code grep ran and both passed. If WP-CLI was unavailable (Part A skipped), do not emit INFR-HTTPS-OK even if Part B was clean — partial checks cannot confirm full HTTPS health.

---

## Finding IDs Reference

| ID | Severity | Trigger |
|----|----------|---------|
| INFR-HTTPS-URL | Warning | siteurl or home URL uses http:// scheme |
| INFR-HTTPS-SSL | Info | FORCE_SSL_ADMIN not set or false |
| INFR-HTTPS-MXD | Warning | Hardcoded http:// URLs found in PHP/JS files |
| INFR-HTTPS-OK | Info | All checks pass — HTTPS configuration healthy |

## Output Format

Return a JSON array of findings. Each triggered check generates one finding. If all checks pass, return `[INFR-HTTPS-OK]` finding. If WP-CLI unavailable and code grep clean, return `[]`.

**Example output (http:// site URLs, no code issues):**
```json
[
  {
    "id": "INFR-HTTPS-URL",
    "severity": "Warning",
    "category": "Infrastructure",
    "title": "WordPress URL not configured for HTTPS",
    "summary": "The WordPress site URL and home URL are set to http://, which means the site serves pages over unencrypted HTTP",
    "detail": "The WordPress 'siteurl' option is set to: http://example.com. The 'home' option is also set to: http://example.com.",
    "location": "WordPress database options: siteurl, home",
    "fix": "Update siteurl and home options to https:// via WordPress Admin Settings > General or WP-CLI."
  },
  {
    "id": "INFR-HTTPS-SSL",
    "severity": "Info",
    "category": "Infrastructure",
    "title": "FORCE_SSL_ADMIN not enabled",
    "summary": "The WordPress admin panel does not explicitly force HTTPS connections",
    "detail": "The FORCE_SSL_ADMIN constant is not set to true in wp-config.php (current value: not set).",
    "location": "wp-config.php (FORCE_SSL_ADMIN constant)",
    "fix": "Add `define('FORCE_SSL_ADMIN', true);` to wp-config.php."
  }
]
```

**Example output (all checks pass):**
```json
[
  {
    "id": "INFR-HTTPS-OK",
    "severity": "Info",
    "category": "Infrastructure",
    "title": "HTTPS configuration healthy",
    "summary": "WordPress URLs use HTTPS, FORCE_SSL_ADMIN is enabled, and no hardcoded http:// URLs found in PHP/JS files",
    "detail": "All HTTPS configuration checks passed.",
    "location": "WordPress configuration and codebase",
    "fix": "No action required."
  }
]
```

## Notes

- This skill self-gates — do NOT add it to the `WP_CLI_SKILLS` array in /diagnose or /investigate commands
- Part A requires live WordPress database access via WP-CLI; Part B only requires synced local files
- When WP-CLI is unavailable, analyst should note this limitation in the report — live DB config values were not checked
- The grep false-positive filters are intentionally conservative; some matches may still be documentation strings embedded in code — manual review of flagged files is recommended
- Protocol-relative URLs (`//domain.com/path`) are NOT flagged — they correctly inherit the page scheme
