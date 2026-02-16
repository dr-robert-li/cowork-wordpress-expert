---
name: diagnostic-user-audit
description: Audits WordPress user accounts for security issues (default admin username, excessive administrators, inactive privileged users)
---

# Diagnostic Skill: User Account Audit

You audit WordPress user accounts for common security issues that increase the risk of unauthorized access or account compromise.

## Scope: Standard Security Checks Only

Per user decision, this skill checks ONLY standard user account security issues. It explicitly DOES NOT check advanced analytics like email domain analysis, capability overrides, or subscriber ratios.

**What we check:**
1. Default 'admin' username (Critical - most targeted username)
2. Excessive administrator accounts (Warning - increases attack surface)
3. Inactive privileged users (Warning - best-effort, requires last login tracking)

**What we explicitly skip:**
- Email domain analysis (e.g., @gmail.com for admin users)
- Custom capability overrides
- Subscriber-to-admin ratios
- User registration settings (separate check)

## How It Works

1. Load site connection details from `sites.json`
2. Run three checks via WP-CLI over SSH
3. Generate structured findings with deterministic IDs
4. Handle graceful degradation if last login tracking unavailable
5. Return findings as JSON array

## Connection Details

```bash
# Read site profile
SITE_NAME="${1:-default-site}"
PROFILE=$(jq -r ".sites[\"$SITE_NAME\"]" sites.json)

HOST=$(echo "$PROFILE" | jq -r '.host')
USER=$(echo "$PROFILE" | jq -r '.user')
WP_PATH=$(echo "$PROFILE" | jq -r '.wp_path')
WP_CLI_PATH=$(echo "$PROFILE" | jq -r '.wp_cli_path')
```

## Security Checks

### Check 1: Default 'admin' Username

**Risk:** Critical - 'admin' is the most commonly targeted username in brute force attacks.

**Detection:**
```bash
# Get all usernames and check if 'admin' exists
ssh -o BatchMode=yes "${USER}@${HOST}" \
  "cd ${WP_PATH} && ${WP_CLI_PATH} user list --field=user_login --format=json" 2>&1
```

Parse JSON array and check if 'admin' exists in the list.

**If found:** Generate Critical finding.

**Finding ID:** `SECR-USERS-ADM` (deterministic)

**Finding:**
```json
{
  "id": "SECR-USERS-ADM",
  "severity": "Critical",
  "category": "Security",
  "title": "Default 'admin' username in use",
  "summary": "The default 'admin' username exists on this site, making brute force attacks more likely to succeed",
  "detail": "A user account with the username 'admin' exists in the WordPress database. This is the default administrator username created during WordPress installation and is the most commonly targeted username in brute force attacks. Attackers only need to guess the password, not the username, significantly reducing security. WordPress.org recommends using unique, non-obvious usernames for all administrator accounts.",
  "location": "User: admin",
  "fix": "Create a new administrator account with a unique username: Go to Users > Add New in WordPress admin, create a new administrator account with a strong, unique username (not 'administrator', 'root', or site name). Log in with the new account, then delete the 'admin' account. WordPress will prompt you to transfer all content ownership to another user - select your new administrator account. IMPORTANT: Ensure the new account has full administrator access before deleting 'admin'."
}
```

### Check 2: Excessive Administrator Accounts

**Risk:** Warning - Too many administrators increases the attack surface and makes privilege escalation easier.

**Detection:**
```bash
# Count users with administrator role
ssh -o BatchMode=yes "${USER}@${HOST}" \
  "cd ${WP_PATH} && ${WP_CLI_PATH} user list --role=administrator --format=count" 2>&1
```

Parse count from output.

**If count > 3:** Generate Warning finding.

**Finding ID:** `SECR-USERS-CNT` (deterministic)

**Finding:**
```json
{
  "id": "SECR-USERS-CNT",
  "severity": "Warning",
  "category": "Security",
  "title": "Excessive administrator accounts ({count})",
  "summary": "This site has {count} administrator accounts, which increases the attack surface for compromised credentials",
  "detail": "WordPress has {count} user accounts with the administrator role. Each administrator account has full control over the site, including the ability to install plugins, modify themes, manage users, and delete content. The principle of least privilege suggests limiting administrator access to only those who absolutely need it. More administrator accounts mean: (1) More potential targets for attackers, (2) Higher risk of credential compromise via phishing or weak passwords, (3) Increased difficulty in auditing who made specific changes, (4) Greater chance of accidental site damage. For most sites, 1-2 administrator accounts is sufficient (primary admin + backup).",
  "location": "Administrator users: {count}",
  "fix": "Review all administrator accounts: Run `wp user list --role=administrator` via SSH to see all admin users. For each admin user, evaluate: (1) Is administrator access still needed? (2) Could they use Editor or lower role instead? Demote unnecessary administrators to Editor role: `wp user set-role <user-id> editor`. Keep 1-2 primary administrators and demote others. Consider using Editor or Author roles for content managers who don't need full site control."
}
```

**If count <= 3:** No finding generated (acceptable number).

### Check 3: Inactive Privileged Users

**Risk:** Warning - Administrator and Editor accounts that haven't logged in for 90+ days may be abandoned or compromised without detection.

**Detection (best-effort):**

This check attempts to identify inactive privileged users by checking last login metadata. However, vanilla WordPress does NOT track last login by default - this requires a plugin or custom code.

**Step 3a: Check if last login tracking is available**

```bash
# Get admin and editor user IDs
ssh -o BatchMode=yes "${USER}@${HOST}" \
  "cd ${WP_PATH} && ${WP_CLI_PATH} user list --role__in=administrator,editor --field=ID --format=json" 2>&1
```

**Step 3b: For each privileged user, check for last login meta**

```bash
# Check common last login meta keys
for USER_ID in ${USER_IDS[@]}; do
  # Try common meta key names
  ssh -o BatchMode=yes "${USER}@${HOST}" \
    "cd ${WP_PATH} && ${WP_CLI_PATH} user meta get ${USER_ID} last_login 2>/dev/null || \
     ${WP_CLI_PATH} user meta get ${USER_ID} wp_last_login 2>/dev/null || \
     ${WP_CLI_PATH} user meta get ${USER_ID} user_last_login 2>/dev/null"
done
```

**Outcome A: Last login meta found and user inactive > 90 days**

**Finding ID:** `SECR-USERS-INA-{user_id_hash}` (deterministic per user)

**Finding:**
```json
{
  "id": "SECR-USERS-INA-{hash}",
  "severity": "Warning",
  "category": "Security",
  "title": "Inactive administrator account: {username}",
  "summary": "Administrator account '{username}' has not logged in for {days} days and may be abandoned",
  "detail": "User account '{username}' (ID: {user_id}) has administrator privileges but has not logged in since {last_login_date} ({days} days ago). Inactive privileged accounts pose security risks: (1) May belong to former employees or contractors who no longer need access, (2) Credentials may be forgotten, written down insecurely, or reused across sites, (3) Compromise of inactive accounts often goes undetected for long periods, (4) Outdated accounts may not follow current password policies. Best practice is to regularly audit and disable or delete accounts that are no longer actively used.",
  "location": "User: {username} (ID: {user_id})",
  "fix": "Review account status: Contact the account owner or responsible party to confirm whether access is still needed. If account is no longer needed: Delete the account via `wp user delete {user_id} --reassign={active_admin_id}` (transfers content ownership to another admin). If account is still needed: Request user to log in and change password. Consider demoting to lower role if full administrator access is not required. Set a reminder to review privileged accounts quarterly."
}
```

**Outcome B: No last login tracking available**

**Finding ID:** `SECR-USERS-TRK` (deterministic)

**Finding:**
```json
{
  "id": "SECR-USERS-TRK",
  "severity": "Info",
  "category": "Security",
  "title": "Last login tracking not available",
  "summary": "Cannot check for inactive privileged users because last login tracking is not enabled",
  "detail": "Attempted to check for inactive administrator and editor accounts by reading last login metadata, but no last login tracking was found. Vanilla WordPress does not track last login dates by default - this feature requires a plugin such as 'WP Last Login', 'User Activity Log', or similar security/audit plugins. Without last login tracking, it's impossible to identify abandoned or inactive privileged accounts that may pose a security risk.",
  "location": "WordPress user metadata",
  "fix": "Install a last login tracking plugin: Search for 'WP Last Login' or 'Simple History' in the WordPress plugin directory. These plugins track user login activity and store last login timestamps in user metadata. After installation, wait 30 days then re-run this diagnostic to identify inactive privileged users. Alternatively, implement custom tracking by hooking into the 'wp_login' action and storing a timestamp in user meta."
}
```

## Hash Generation for Deterministic IDs

For findings that vary by user (inactive users), generate deterministic IDs based on user ID:

```bash
generate_user_finding_id() {
  local check_type="$1"  # e.g., INA for inactive
  local user_id="$2"
  local hash=$(echo -n "$user_id" | md5sum | cut -c1-3)
  echo "SECR-USERS-${check_type}-${hash}"
}
```

## Error Handling

### WP-CLI Not Available

**Action:** Generate Warning finding.

**Finding ID:** `SECR-USERS-CLI`

**Finding:**
```json
{
  "id": "SECR-USERS-CLI",
  "severity": "Warning",
  "category": "Configuration",
  "title": "WP-CLI not available for user audit",
  "summary": "Cannot audit user accounts because WP-CLI is not installed or not accessible",
  "detail": "Attempted to run WP-CLI user commands but WP-CLI was not found at {WP_CLI_PATH}. User account security auditing requires WP-CLI to query the WordPress user database remotely without direct database access.",
  "location": "Server: {HOST}",
  "fix": "Install WP-CLI on the server: `curl -O https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x wp-cli.phar && sudo mv wp-cli.phar /usr/local/bin/wp`. Then update the wp_cli_path in sites.json with the correct path."
}
```

### SSH Connection Failure

**Action:** Generate Warning finding.

**Finding ID:** `SECR-USERS-SSH`

**Finding:**
```json
{
  "id": "SECR-USERS-SSH",
  "severity": "Warning",
  "category": "Configuration",
  "title": "Cannot connect to server for user audit",
  "summary": "SSH connection to server failed, preventing user account security check",
  "detail": "SSH connection to {USER}@{HOST} failed with error: {error_message}. Without SSH access, user account audit cannot be performed.",
  "location": "Server: {HOST}",
  "fix": "Verify SSH connectivity: `ssh {USER}@{HOST} 'echo connected'`. Check firewall rules, ensure SSH service is running, and verify hostname/IP is correct in sites.json."
}
```

## Output Format

Return a JSON array of findings. Each check that finds an issue generates one finding. If no issues found (e.g., no 'admin' user, <= 3 admins, last login tracking not available but no other issues), return only Info findings or empty array.

**Example output (default admin username, 5 admins):**
```json
[
  {
    "id": "SECR-USERS-ADM",
    "severity": "Critical",
    "category": "Security",
    "title": "Default 'admin' username in use",
    "summary": "The default 'admin' username exists on this site, making brute force attacks more likely to succeed",
    "detail": "A user account with the username 'admin' exists in the WordPress database...",
    "location": "User: admin",
    "fix": "Create a new administrator account with a unique username..."
  },
  {
    "id": "SECR-USERS-CNT",
    "severity": "Warning",
    "category": "Security",
    "title": "Excessive administrator accounts (5)",
    "summary": "This site has 5 administrator accounts, which increases the attack surface for compromised credentials",
    "detail": "WordPress has 5 user accounts with the administrator role...",
    "location": "Administrator users: 5",
    "fix": "Review all administrator accounts: Run `wp user list --role=administrator`..."
  },
  {
    "id": "SECR-USERS-TRK",
    "severity": "Info",
    "category": "Security",
    "title": "Last login tracking not available",
    "summary": "Cannot check for inactive privileged users because last login tracking is not enabled",
    "detail": "Attempted to check for inactive administrator and editor accounts...",
    "location": "WordPress user metadata",
    "fix": "Install a last login tracking plugin: Search for 'WP Last Login' or 'Simple History'..."
  }
]
```

**Example output (no issues, last login tracking available, all users active):**
```json
[]
```

## Notes

- Use `--role__in=administrator,editor` to check both privileged roles for inactive users
- Check common last login meta key variants: `last_login`, `wp_last_login`, `user_last_login`
- 90 days is the threshold for "inactive" - this is a standard security audit interval
- Generate deterministic IDs for tracking findings across scans
- Graceful degradation if last login tracking is not available (Info finding, not Warning)
- Provide specific fix instructions with exact WP-CLI commands where applicable
