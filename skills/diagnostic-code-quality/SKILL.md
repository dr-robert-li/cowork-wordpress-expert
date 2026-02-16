---
name: diagnostic-code-quality
description: Performs AI-powered code quality analysis on custom WordPress code (active theme + custom plugins) using a two-pass tiered approach - quick pattern scan for known anti-patterns, followed by deep AI contextual analysis on flagged files.
---

# WordPress Code Quality Diagnostic Skill

This skill performs comprehensive code quality analysis on custom WordPress code using a tiered approach to maximize efficiency while providing deep, actionable insights.

## Analysis Scope

**Analyze:** Active theme + custom (non-WP.org) plugins only
**Skip:** Core WordPress files and plugins from the WordPress.org repository (version audit handles those)

## Section 1: Target Selection

Before analysis, determine which code to scan based on the connected WordPress site.

### Step 1.1: Identify Active Theme

Get the active theme (parent) and child theme if applicable:

```bash
# Get active parent theme
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} option get template"

# Get active stylesheet (child theme if different from template)
ssh {user}@{host} "cd {wp_path} && {wp_cli_path} option get stylesheet"
```

**Scan targets:** All PHP and JS files in:
- `.sites/{site-name}/wp-content/themes/{template}/` (parent theme)
- `.sites/{site-name}/wp-content/themes/{stylesheet}/` (child theme if different)

### Step 1.2: Identify Custom Plugins

For each plugin directory in `.sites/{site-name}/wp-content/plugins/`, determine if it's a custom plugin or from WordPress.org:

**WP.org Plugin Detection Heuristic:**

1. Check if `readme.txt` exists with "Stable tag:" header
2. Verify the slug exists on WordPress.org API:
   ```bash
   curl -s "https://api.wordpress.org/plugins/info/1.2/?action=plugin_information&request[slug]={dirname}" | grep -q '"error"'
   ```
3. **If API returns error** (not found on WP.org) = **CUSTOM PLUGIN** → Do full code analysis
4. **If API returns plugin info** = **WP.org plugin** → SKIP code analysis (version audit handles this)

**Alternative:** Check plugin headers for "Plugin URI" pointing to wordpress.org domains

### Step 1.3: List Scan Targets

Before proceeding, output a list of all selected targets:

```
Code Quality Scan Targets:
- Theme: {theme-name} ({file-count} files)
- Child Theme: {child-theme-name} ({file-count} files) [if applicable]
- Custom Plugins:
  - {plugin-1-name} ({file-count} files)
  - {plugin-2-name} ({file-count} files)

Total scan targets: {N} files across {M} directories
```

## Section 2: Pass 1 - Quick Pattern Scan (All Target Files)

Use grep to scan locally synced files for known anti-patterns. This provides fast initial detection before deeper AI analysis.

### 2.1: Deprecated WordPress Functions (Warning)

Detect usage of deprecated or removed WordPress and PHP functions:

```bash
grep -rn -E "(mysql_query|mysql_connect|mysql_real_escape_string|get_bloginfo\s*\(\s*['\"]url|wp_specialchars|get_settings\s*\(|create_function|[^a-z]each\s*\()" {target_dir} --include="*.php"
```

**Pattern matches:**
- `mysql_query`, `mysql_connect`, `mysql_real_escape_string` - Removed in PHP 7+
- `get_bloginfo('url')` - Use `home_url()` instead
- `wp_specialchars` - Use `esc_html()` instead
- `get_settings` - Use `get_option()` instead
- `create_function` - Use closures/anonymous functions instead
- `each()` - Use `foreach` instead

**For each match:** Record file path, line number, matched function, and pattern category.

### 2.2: SQL Injection Risks (Critical)

Detect potentially unsafe database queries:

```bash
grep -rn '\$wpdb->query\|\$wpdb->get_results\|\$wpdb->get_row\|\$wpdb->get_var' {target_dir} --include="*.php"
```

**For each match:**
1. Extract the matched line and 3 lines before/after for context
2. Check if `prepare` appears within the context
3. Check if variables (`$`) appear directly in SQL strings without `prepare()`
4. Flag if no `prepare()` found or if direct variable interpolation detected

**High-risk patterns:**
- `$wpdb->query("SELECT ... WHERE field = {$_GET['id']}")`
- `$wpdb->get_results("... WHERE ... " . $var)`
- SQL concatenation with user input variables

### 2.3: Missing Input Sanitization (Warning)

Detect direct superglobal usage without sanitization:

```bash
grep -rn '\$_GET\[\|\$_POST\[\|\$_REQUEST\[' {target_dir} --include="*.php"
```

**For each match:**
1. Extract surrounding context (5 lines before/after)
2. Check for sanitization functions: `sanitize_*`, `esc_*`, `absint()`, `intval()`, `wp_unslash()`
3. Flag if no sanitization found within immediate context

**Exception:** Variable assignment followed by sanitization on next line is acceptable.

### 2.4: Missing Nonce Verification (Warning)

Detect form/AJAX handlers processing POST data without nonce checks:

```bash
grep -rn 'wp_ajax_\|admin_post_' {target_dir} --include="*.php"
```

**For each AJAX/form handler function:**
1. Check if function body contains `wp_verify_nonce` or `check_ajax_referer`
2. Flag if `$_POST` usage found without nonce verification in the same function

### 2.5: Hardcoded Credentials/API Keys (Critical)

Detect potential exposed secrets:

```bash
grep -rn -E "(api_key|apikey|api_secret|password|secret_key|access_token)\s*=\s*['\"][^'\"]+['\"]" {target_dir} --include="*.php" --include="*.js"
```

**For each match:**
1. Check if value is a placeholder (e.g., "your-api-key", "xxxxx", "")
2. Flag if value appears to be a real credential (length > 10, alphanumeric)
3. **Critical** if it looks like a real key/token/password

**Note:** Constants defined as empty strings or obvious placeholders are Info-level only.

### 2.6: extract() Usage (Warning)

Detect dangerous `extract()` usage which can overwrite variables:

```bash
grep -rn "extract\s*(" {target_dir} --include="*.php"
```

**Flag all matches** - `extract()` is considered dangerous as it can:
- Overwrite existing variables unpredictably
- Create variable name conflicts
- Enable variable injection attacks

**Recommendation:** Use explicit array key access instead.

### 2.7: Direct File Includes with User Input (Critical)

Detect potential local/remote file inclusion vulnerabilities:

```bash
grep -rn -E "(include|require)(_once)?\s*\(.*\\\$_(GET|POST|REQUEST)" {target_dir} --include="*.php"
```

**For each match:**
- Flag as **Critical** - direct security vulnerability
- Any user input in include/require paths is exploitable

### 2.8: Pattern Scan Summary

After completing all pattern scans, create a summary:

```
Pass 1 Results: {N} potential issues detected across {M} files

Flagged Files (for Pass 2 deep analysis):
- {file1.php} - {count} matches [{pattern-types}]
- {file2.php} - {count} matches [{pattern-types}]
...
```

## Section 3: Pass 2 - Deep AI Analysis (Flagged Files Only)

For each file with pattern matches from Pass 1, perform deep contextual analysis.

### 3.1: Read Full File Content

Read the complete file to understand context, architecture, and patterns.

### 3.2: WordPress Coding Standards Analysis

Analyze the file for WordPress-specific code quality issues:

**Hook Usage Patterns:**
- Are actions and filters registered correctly?
- Are hook priorities and argument counts appropriate?
- Are custom hooks documented?

**Class Structure & Separation of Concerns:**
- Is business logic properly separated from presentation?
- Are classes following Single Responsibility Principle?
- Is proper namespacing used to avoid collisions?
- Are autoloading patterns appropriate for WordPress?

**Error Handling:**
- Are `WP_Error` objects used for API boundaries instead of exceptions?
- Are external operations (API calls, file I/O) wrapped in try/catch?
- Are errors logged appropriately without exposing details to users?
- Are admin notices used for user-facing recoverable errors?

**Script/Style Enqueueing:**
- Are scripts/styles properly enqueued using `wp_enqueue_*`?
- Are there hardcoded `<script>` or `<link>` tags in PHP files?
- Are dependencies declared correctly?

**Database Operations:**
- Are custom tables created using `dbDelta()`?
- Is the `$wpdb->prefix` used correctly for custom tables?
- Are indexes defined for frequently queried columns?
- Are transients used for caching expensive queries?

**WordPress API Usage:**
- Is the Options API used correctly (autoload only when necessary)?
- Are custom post types and taxonomies registered with appropriate capabilities?
- Are WordPress transients/cache API used for performance?

### 3.3: Validate Pass 1 Pattern Matches

For each pattern match found in Pass 1, analyze with full context:

**Determine if it's a real issue or false positive:**
- Is the `$wpdb->query` actually missing `prepare()`, or is it used with a safe static string?
- Is the `$_GET` usage actually unsanitized, or is sanitization on the next line?
- Is the deprecated function in active code or commented out?

**Classify severity with context:**
- Some findings may be less severe based on usage context
- Some may be more severe than initially flagged

### 3.4: Identify Additional Issues

Beyond pattern matches, identify broader code quality problems:

**Architecture Issues:**
- Template files containing business logic
- Direct database queries in templates
- Lack of data validation at boundaries
- Missing capability checks on admin functions

**Performance Issues:**
- Queries inside loops (N+1 problems)
- Missing transient/caching for expensive operations
- Autoloaded options that shouldn't be

**Security Beyond Patterns:**
- Missing capability checks (`current_user_can()`)
- Unrestricted file uploads
- Exposed debug information
- AJAX endpoints without proper authentication

## Section 4: Finding Output Format

Each finding must be structured with the following fields:

### Finding Structure

```json
{
  "id": "CODE-{CHECK_TYPE}-{3-char-hash}",
  "severity": "Critical | Warning | Info",
  "category": "Code Quality",
  "title": "Descriptive finding title",
  "summary": "One sentence non-technical explanation for stakeholders",
  "detail": "Technical explanation with problematic code snippet and context",
  "location": "{file-path}:{line-number}",
  "fix": {
    "before": "// Problematic code snippet",
    "after": "// Fixed code snippet"
  }
}
```

### Finding ID Generation

Generate deterministic IDs based on finding type and location:

**Format:** `CODE-{TYPE}-{HASH}`

**Type Codes:**
- `DEPR` - Deprecated function usage
- `SQLI` - SQL injection risk
- `SANI` - Missing sanitization
- `NONC` - Missing nonce verification
- `CRED` - Hardcoded credentials
- `EXTR` - extract() usage
- `INCL` - Unsafe file inclusion
- `ARCH` - Architecture/design issue
- `PERF` - Performance issue
- `HOOK` - Hook usage issue
- `AUTH` - Missing authorization check

**Hash:** First 3 characters of MD5 hash of `{file-path}:{line-number}`

**Example IDs:**
- `CODE-SQLI-a3f` - SQL injection at specific location
- `CODE-DEPR-b12` - Deprecated function usage
- `CODE-NONC-c9d` - Missing nonce check

### Severity Guidelines

**Critical:**
- SQL injection vulnerabilities
- Hardcoded credentials/secrets (real values, not placeholders)
- Unsafe file includes with user input
- Missing authentication/authorization on sensitive operations
- Data exposure vulnerabilities

**Warning:**
- Deprecated functions (may break in future WordPress/PHP versions)
- Missing input sanitization (security risk but may have other protections)
- Missing nonce verification (CSRF risk)
- extract() usage (code quality/maintainability)
- Architecture issues affecting security or maintainability

**Info:**
- Code style inconsistencies
- Minor performance improvements
- Documentation gaps
- Best practice recommendations

### Summary Guidelines

Write non-technical summaries that stakeholders can understand:

**Good:** "A database query is built using user-provided data without safety checks, which could allow attackers to manipulate the database."

**Bad:** "$wpdb->prepare() not used on line 142."

### Detail Guidelines

Provide technical context with code evidence:

```
Detail: The function `handle_user_query()` at wp-content/themes/custom/functions.php:142
passes user input directly into a SQL query without using $wpdb->prepare():

    $results = $wpdb->get_results("SELECT * FROM {$wpdb->posts} WHERE ID = {$_GET['id']}");

This allows an attacker to inject arbitrary SQL by manipulating the 'id' parameter.
```

### Fix Examples

Provide before/after code snippets showing the exact fix:

**Example 1: SQL Injection**
```
Before:
$results = $wpdb->get_results("SELECT * FROM {$wpdb->posts} WHERE ID = {$_GET['id']}");

After:
$post_id = absint($_GET['id']);
$results = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->posts} WHERE ID = %d", $post_id));
```

**Example 2: Missing Sanitization**
```
Before:
$user_name = $_POST['name'];
update_user_meta($user_id, 'display_name', $user_name);

After:
$user_name = sanitize_text_field($_POST['name']);
update_user_meta($user_id, 'display_name', $user_name);
```

**Example 3: Deprecated Function**
```
Before:
$site_url = get_bloginfo('url');

After:
$site_url = home_url();
```

**Example 4: extract() Usage**
```
Before:
extract($_POST);
echo $user_email;

After:
$user_email = isset($_POST['user_email']) ? sanitize_email($_POST['user_email']) : '';
echo $user_email;
```

## Section 5: Output Format

Return all findings as a JSON array that can be processed by the reporting system:

```json
[
  {
    "id": "CODE-SQLI-a3f",
    "severity": "Critical",
    "category": "Code Quality",
    "title": "SQL query without prepared statement",
    "summary": "A database query is built using user-provided data without safety checks, which could allow attackers to manipulate the database.",
    "detail": "The function handle_user_query() at wp-content/themes/custom/functions.php:142 passes user input directly into SQL without using $wpdb->prepare():\n\n    $wpdb->get_results(\"SELECT * FROM {$wpdb->posts} WHERE ID = {$_GET['id']}\")\n\nThis allows SQL injection via the 'id' parameter.",
    "location": "wp-content/themes/custom/functions.php:142",
    "fix": {
      "before": "$wpdb->get_results(\"SELECT * FROM {$wpdb->posts} WHERE ID = {$_GET['id']}\")",
      "after": "$post_id = absint($_GET['id']);\n$wpdb->get_results($wpdb->prepare(\"SELECT * FROM {$wpdb->posts} WHERE ID = %d\", $post_id))"
    }
  },
  {
    "id": "CODE-DEPR-b12",
    "severity": "Warning",
    "category": "Code Quality",
    "title": "Deprecated function get_bloginfo('url')",
    "summary": "The code uses an outdated WordPress function that may be removed in future versions.",
    "detail": "At wp-content/themes/custom/header.php:23, get_bloginfo('url') is used:\n\n    $home = get_bloginfo('url');\n\nThis function parameter is deprecated since WordPress 2.2. It may be removed in future versions.",
    "location": "wp-content/themes/custom/header.php:23",
    "fix": {
      "before": "$home = get_bloginfo('url');",
      "after": "$home = home_url();"
    }
  }
]
```

## Execution Summary

After completing analysis, provide a summary:

```
=== Code Quality Analysis Complete ===

Targets Analyzed:
- {N} files across {M} themes/plugins

Pass 1 (Pattern Scan):
- {X} potential issues detected
- {Y} files flagged for deep analysis

Pass 2 (AI Analysis):
- {Z} confirmed issues
- {W} false positives dismissed
- {V} additional issues discovered

Total Findings: {total}
- Critical: {count}
- Warning: {count}
- Info: {count}

Output: JSON findings array ready for report generation
```

---

**Note:** This skill is designed to work with locally synced WordPress files (via rsync). All file paths are relative to `.sites/{site-name}/` directory. SSH commands are used only for WordPress information queries (active theme detection), not for code analysis itself.
