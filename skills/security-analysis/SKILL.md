---
name: security-analysis
description: Evaluates WordPress codebase against OWASP Top 10 and WP-specific vulnerability patterns. Use when reviewing code security, auditing plugins/themes, or investigating security incidents.
---

# Domain 1: Security Audit

Evaluate the codebase and configuration against OWASP Top 10 and WordPress-specific vulnerability patterns.

## 1.1 Input Validation & Sanitization

- All user inputs pass through appropriate WordPress sanitization functions (`sanitize_text_field()`, `sanitize_email()`, `absint()`, `wp_kses()`, `wp_kses_post()`)
- `$_GET`, `$_POST`, `$_REQUEST`, `$_SERVER`, `$_COOKIE` are never used directly without sanitization
- Database inputs use `$wpdb->prepare()` for all parameterized queries — no raw string concatenation in SQL
- File upload validation checks MIME type, extension, and file size using WordPress APIs
- `esc_url()` used for all URLs before output or redirect

## 1.2 Output Escaping

- All dynamic output escaped with context-appropriate functions:
  - HTML context: `esc_html()`
  - Attribute context: `esc_attr()`
  - JavaScript context: `esc_js()` or `wp_json_encode()`
  - URL context: `esc_url()`
  - Translation with escaping: `esc_html__()`, `esc_html_e()`, `esc_attr__()`
- Template files reviewed for raw `echo` of user-controlled data
- No use of `eval()`, `assert()`, `preg_replace()` with `e` modifier, or `create_function()`

## 1.3 Authentication & Authorization

- All AJAX handlers check `check_ajax_referer()` or equivalent nonce verification
- All form submissions verify nonces via `wp_verify_nonce()`
- REST API endpoints use `permission_callback` (never `__return_true` for sensitive operations)
- Capability checks (`current_user_can()`) before any privileged operation
- No hardcoded credentials, API keys, or secrets in source code
- Authentication cookies use `httpOnly`, `Secure`, and `SameSite` flags where applicable

## 1.4 Cross-Site Request Forgery (CSRF)

- Every form includes `wp_nonce_field()`
- Every form handler verifies nonce before processing
- AJAX actions use `wp_create_nonce()` / `check_ajax_referer()`
- State-changing operations never triggered by GET requests alone

## 1.5 SQL Injection

- All database queries use `$wpdb->prepare()` with proper placeholders (`%s`, `%d`, `%f`)
- No direct concatenation of variables into SQL strings
- `LIKE` queries use `$wpdb->esc_like()` followed by `$wpdb->prepare()`
- Custom table creation uses `dbDelta()` with proper schema
- No use of `query()` with unsanitized input

## 1.6 File Security

- Direct file access prevented with `ABSPATH` check at top of PHP files
- File uploads restricted to safe types, stored outside webroot or with `.htaccess` protection
- Directory listing disabled
- `wp-config.php` not accessible from web
- Debug log files (`debug.log`) not publicly accessible
- No `phpinfo()` calls in production code
- File permissions follow WordPress recommendations (644 for files, 755 for directories)

## 1.7 Data Exposure

- `WP_DEBUG` set to `false` in production
- `WP_DEBUG_DISPLAY` set to `false` in production
- `WP_DEBUG_LOG` either `false` or logging to a non-public path
- Error reporting suppressed in production (`display_errors = Off`)
- Sensitive data not stored in `wp_options` without encryption
- User enumeration mitigated (author archives, REST API user endpoint)
- WordPress version not exposed in HTML source or headers
- `readme.html` and `license.txt` removed or access-restricted

## 1.8 Obfuscated / Malicious Code Detection

- Scan for `base64_decode()`, `gzinflate()`, `str_rot13()`, `gzuncompress()` chains
- Flag any `eval()` usage with dynamic content
- Detect obfuscated variable names or encoded strings
- Check for unauthorized file modifications (compare against known-good checksums)
- Identify backdoor patterns: hidden admin accounts, rogue cron jobs, injected `wp_options` entries

## 1.9 Dependency & Supply Chain

- All plugins and themes sourced from reputable origins
- No nulled/pirated plugins or themes
- Plugin and theme versions checked against known vulnerability databases (WPScan, Patchstack, Wordfence Intelligence)
- Composer dependencies audited for known vulnerabilities
- npm/node dependencies (if applicable) checked with `npm audit`

---

## Quick Reference: WordPress Red Flags

Immediate investigation triggers — if you encounter any of these, escalate severity:

- `eval()` with any dynamic content
- `base64_decode()` followed by `eval()` or `include`
- SQL queries without `$wpdb->prepare()`
- `wp_ajax_nopriv_` handlers without rate limiting or input validation
- `WP_DEBUG` set to `true` with `WP_DEBUG_DISPLAY` also `true` in production
- Default `wp_` table prefix in production
- WordPress core files modified (non-standard checksums)
- Admin user with ID 1 and username "admin"
- Empty `index.php` files missing from directories (directory traversal risk)
- `.git` directory accessible from web
- `wp-config.php` backup files in webroot (`wp-config.php.bak`, `wp-config.old`)
- Plugins not updated for 2+ years with known vulnerabilities
- PHP version below 8.0 (end of security support)
- MySQL version below 8.0 / MariaDB below 10.5

---

## Tool Usage: Security Analysis Commands

### Security-Specific Static Analysis

```bash
# Scan for eval() usage
grep -rn "eval(" /path/to/plugin --include="*.php"

# Scan for base64_decode (potential obfuscation)
grep -rn "base64_decode(" /path/to/plugin --include="*.php"

# Scan for direct superglobal usage (missing sanitization)
grep -rn '$_GET\|$_POST\|$_REQUEST\|$_SERVER\|$_COOKIE' /path/to/plugin --include="*.php"

# Scan for SQL queries without prepare (SQL injection risk)
grep -rn "query(" /path/to/plugin --include="*.php" | grep -v "prepare"

# Scan for common backdoor functions
grep -rn 'system(\|exec(\|passthru(\|shell_exec(\|popen(' /path/to/plugin --include="*.php"
```

### WordPress Core Integrity

```bash
# Verify WordPress core file checksums
wp core verify-checksums

# Verify plugin checksums
wp plugin verify-checksums --all
```
