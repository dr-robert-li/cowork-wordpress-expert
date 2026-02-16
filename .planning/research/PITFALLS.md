# Domain Pitfalls

**Domain:** Claude CoWork Plugin for WordPress Remote Diagnostics
**Researched:** 2026-02-16
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: SSH Credential Exposure in sites.json

**What goes wrong:**
SSH credentials (passwords, private keys, hostnames, usernames) stored in `sites.json` get committed to version control, logged in Claude conversation history, or exposed in error messages. This immediately compromises all managed WordPress sites.

**Why it happens:**
- CoWork plugins use JSON config files for site data
- Developers add `sites.json` before creating `.gitignore`
- Claude's context window includes the entire file during analysis
- Error messages may echo back credential values
- Temporary command output can include sensitive data

**How to avoid:**
1. **Never store credentials directly in sites.json**
   - Store SSH config references only (`Host alias` from `~/.ssh/config`)
   - Use SSH key-based authentication exclusively
   - Reference keys by path, not inline content

2. **Immediate .gitignore setup**
   - Add `sites.json` to `.gitignore` in Phase 1
   - Pattern: `sites.json`, `*.local.json`, `credentials.json`
   - Verify with `git status --ignored`

3. **Credential indirection**
   - Store connection aliases: `{"site": "production", "ssh_host": "prod-wp"}`
   - Real credentials live in `~/.ssh/config` which is never synced
   - Use SSH agent for key management, not file paths

4. **Command output sanitization**
   - Never `cat sites.json` in Claude commands
   - Redirect rsync/ssh output carefully: `2>&1 | grep -v 'password'`
   - Use `--quiet` flags where possible

**Warning signs:**
- `sites.json` appears in `git status` unignored
- Claude responses contain connection strings
- Command outputs show hostnames/usernames
- Error messages include authentication details

**Phase to address:**
Phase 1 (Foundation) - Establish security patterns before any site connections

**Sources:**
- [SSH Config: The Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/ssh-config-complete-guide)
- [Best practices for protecting SSH credentials | Google Cloud](https://cloud.google.com/compute/docs/connect/ssh-best-practices/credentials)
- [How Should Credentials Be Stored in JSON?](https://sourcebae.com/blog/how-should-credentials-be-stored-in-json/)

---

### Pitfall 2: rsync --delete Flag Disasters

**What goes wrong:**
Using `rsync --delete` when syncing from remote to local can wipe out the local analysis directory if the remote path is wrong, the SSH connection drops mid-sync, or the remote filesystem isn't mounted properly. All diagnostic work is lost.

**Why it happens:**
- `--delete` removes files in destination not present in source
- WordPress diagnostic tools commonly use "pull" (remote → local) workflows
- Remote path typos create empty source directories
- SSH timeouts can interrupt mid-transfer
- Developers copy rsync commands without understanding flags

**How to avoid:**
1. **Always use --dry-run first**
   ```bash
   # Preview before executing
   rsync -avz --dry-run --exclude='.git*' user@host:/path/to/wp/ ./local/
   # Check output, then remove --dry-run
   ```

2. **Avoid --delete in diagnostic tools**
   - For read-only analysis, deletion is rarely needed
   - If required, add explicit confirmation step
   - Use `--delete-after` (safer) not `--delete-before`

3. **Explicit exclusions**
   - Always exclude: `.git*`, `node_modules/`, `vendor/`, `.env`
   - WordPress-specific: `wp-content/cache/`, `wp-content/uploads/` (large)
   - Pattern: `--exclude={.git*,node_modules,vendor,.env,*.log}`

4. **Direction matters**
   - Push (local → remote): safer with `--delete` (remote is target)
   - Pull (remote → local): dangerous with `--delete` (local is target)
   - For diagnostics, pull WITHOUT `--delete`

5. **Trailing slash awareness**
   ```bash
   # WRONG: copies content INTO local/wp-content
   rsync source/wp-content/ local/

   # RIGHT: copies wp-content AS local/wp-content
   rsync source/wp-content local/
   ```

**Warning signs:**
- rsync commands lack `--dry-run` in documentation
- No exclusion patterns specified
- `--delete` used in pull operations
- Missing trailing slash handling

**Phase to address:**
Phase 1 (Foundation) - Document safe rsync patterns before site connections

**Sources:**
- [Everyday rsync - VKC.sh](https://vkc.sh/everyday-rsync/)
- [How to Exclude Files and Directories with Rsync](https://linuxize.com/post/how-to-exclude-files-and-directories-with-rsync/)
- [Favorite rsync Commands for Copying WordPress Sites](https://guides.wp-bullet.com/favorite-rsync-commands-for-copying-wordpress-sites/)

---

### Pitfall 3: WP-CLI Path Assumptions Across Hosts

**What goes wrong:**
Commands fail on different hosting providers because WP-CLI is installed at different paths (`wp`, `/usr/local/bin/wp`, `~/bin/wp-cli.phar`) or different versions (2.x vs 3.x) with incompatible syntax. Managed hosts may not have WP-CLI at all.

**Why it happens:**
- Each host installs WP-CLI differently (package manager, manual download, or not at all)
- Shell `$PATH` varies by hosting provider
- `~/.bash_profile` not loaded in SSH command mode
- WP Engine, Kinsta, Flywheel have custom WP-CLI installations
- Some hosts block WP-CLI for security

**How to avoid:**
1. **Probe for WP-CLI availability**
   ```bash
   # Test multiple common paths
   ssh user@host 'which wp || which wp-cli || ls ~/bin/wp-cli.phar'
   ```

2. **Store per-site WP-CLI path**
   ```json
   {
     "site": "production",
     "ssh_host": "prod-wp",
     "wp_cli_path": "/usr/local/bin/wp",
     "wp_cli_version": "2.10.0"
   }
   ```

3. **Fallback chain**
   - Try `wp` (in PATH)
   - Try `/usr/local/bin/wp`
   - Try `~/wp-cli.phar`
   - Fall back to direct MySQL queries if no WP-CLI
   - Document which hosts lack WP-CLI

4. **Version compatibility checks**
   ```bash
   # Check version before running commands
   ssh user@host 'wp --version'
   # Some WP-CLI 2.x commands don't exist in 3.x
   ```

5. **SSH environment handling**
   - Use `ssh -t` for pseudo-TTY (loads profile)
   - Or explicitly: `ssh user@host 'source ~/.bash_profile && wp ...'`
   - Or use absolute paths: `ssh user@host '/usr/local/bin/wp ...'`

**Warning signs:**
- Hardcoded `wp` commands without path verification
- No version checks before running commands
- Error: "wp: command not found" on some hosts
- Different behavior across different sites

**Phase to address:**
Phase 2 (Site Detection) - Probe host capabilities before running diagnostics

**Sources:**
- [Running Commands Remotely - WP-CLI](https://make.wordpress.org/cli/handbook/guides/running-commands-remotely/)
- [SSH: Allow to specify path of remote wp-cli](https://github.com/wp-cli/wp-cli/issues/5245)
- [Streamline WordPress Deployment Using WP-CLI and SSH - 2026](https://www.wewp.io/wp-cli-ssh-wordpress-deployments-2026/)

---

### Pitfall 4: Claude Context Window Exhaustion on Large Sites

**What goes wrong:**
Syncing an entire WordPress site (10GB+ with uploads/cache) overwhelms Claude's context window when analyzing files. The plugin becomes unusable, responses timeout, or critical diagnostic details get "lost in the middle" of the context.

**Why it happens:**
- WordPress sites with uploads can be 10GB-100GB
- Claude Opus 4.6 has 1M token context (~500 pages of text)
- A large codebase can be 200K tokens alone
- Syncing everything wastes context on irrelevant files
- The "lost in the middle" problem: important details overlooked in large contexts

**How to avoid:**
1. **Selective sync, not full site**
   ```bash
   # WRONG: sync everything
   rsync -avz user@host:/var/www/wordpress/ ./site/

   # RIGHT: sync only what's needed for diagnostics
   rsync -avz \
     --exclude='wp-content/uploads/' \
     --exclude='wp-content/cache/' \
     --exclude='*.log' \
     --exclude='*.sql' \
     user@host:/var/www/wordpress/{wp-config.php,wp-content/{plugins,themes,mu-plugins}} \
     ./site/
   ```

2. **Diagnostic-focused exclusions**
   - Exclude: uploads, cache, backups, logs (10GB+ commonly)
   - Include: core files, plugins, themes, wp-config.php
   - For upload issues: sync only one sample file

3. **Incremental analysis**
   - Don't read all files at once
   - Analyze by category: "Check plugin versions" → "Check theme errors" → "Check config"
   - Use grep/search tools instead of reading entire files

4. **Size checks before sync**
   ```bash
   # Check remote directory size first
   ssh user@host 'du -sh /var/www/wordpress/wp-content/uploads'
   # If > 1GB, don't sync uploads
   ```

5. **Premium context awareness**
   - Requests > 200K tokens cost 2x input, 1.5x output
   - Prefer multiple small syncs over one massive sync
   - Monitor Claude Code response lag as warning sign

**Warning signs:**
- rsync transfers take > 5 minutes
- Local site directory > 1GB
- Claude responses slow down significantly
- "Lost context" errors or incomplete analysis
- Commands timing out

**Phase to address:**
Phase 2 (Site Detection) - Establish size limits and exclusion patterns

**Sources:**
- [Claude Opus 4.6: 1 Million Token Context Window Guide](https://www.nxcode.io/resources/news/claude-1m-token-context-codebase-analysis-guide-2026)
- [A practical guide to the Claude code context window size](https://www.eesel.ai/blog/claude-code-context-window-size)
- [How Claude Code Got Better by Protecting More Context](https://hyperdev.matsuoka.com/p/how-claude-code-got-better-by-protecting)

---

### Pitfall 5: Cross-Platform rsync Incompatibility (macOS vs Linux)

**What goes wrong:**
rsync commands that work on Linux fail on macOS Sequoia (2025+) because Apple replaced GNU rsync 2.6.9 with openrsync, which accepts only a subset of rsync flags. Automated workflows break when developers switch machines.

**Why it happens:**
- macOS Sequoia (2025) replaced rsync with openrsync (BSD license)
- openrsync only supports protocol 29 vs rsync 3.x protocol 31
- Many rsync flags don't exist in openrsync
- Character encoding differs between macOS and Linux filesystems
- macOS metadata (extended attributes) not compatible with Linux rsync

**How to avoid:**
1. **Test on both platforms**
   - Document which OS was tested
   - Flag commands as "Linux only" or "macOS compatible"
   - Provide platform-specific variations

2. **Use compatible flag subset**
   ```bash
   # Compatible with both rsync and openrsync
   rsync -avz --exclude='.git*' source/ dest/

   # macOS-specific issues require:
   --iconv=UTF-8-MAC,UTF-8  # character encoding
   --fake-super              # metadata compatibility
   ```

3. **Version detection**
   ```bash
   # Check which rsync is installed
   rsync --version | head -1
   # openrsync: version 2.6.9, protocol 29
   # rsync: version 3.x, protocol 31
   ```

4. **Homebrew fallback for macOS**
   ```bash
   # Install GNU rsync on macOS if advanced features needed
   brew install rsync
   # Use explicit path: /opt/homebrew/bin/rsync
   ```

5. **Document platform requirements**
   - README: "Tested on macOS Sequoia with openrsync"
   - Or: "Requires GNU rsync 3.x (use Homebrew on macOS)"
   - List incompatible flags if using openrsync

**Warning signs:**
- rsync commands work on Linux but fail on macOS
- "unknown option" errors on macOS
- File names with accented characters corrupted
- Extended attributes lost during transfer

**Phase to address:**
Phase 1 (Foundation) - Detect platform and document compatibility

**Sources:**
- [rsync replaced with openrsync on macOS Sequoia](https://derflounder.wordpress.com/2025/04/06/rsync-replaced-with-openrsync-on-macos-sequoia/)
- [Rsync between Mac and Linux - Something Odd!](https://odd.blog/2020/10/06/rsync-between-mac-and-linux/)
- [What you should know about Apple's switch from rsync to openrsync](https://appleinsider.com/inside/macos-sequoia/tips/what-you-should-know-about-apples-switch-from-rsync-to-openrsync)

---

### Pitfall 6: WordPress File Permissions Corrupted by rsync

**What goes wrong:**
After rsync, WordPress can't write uploads, update plugins, or create cache files because rsync transferred incorrect permissions (775/777 directories became 755, or 644 files became 600). The site appears broken but code is intact.

**Why it happens:**
- rsync preserves source permissions by default (`-a` flag includes `-p`)
- WordPress expects directories: 755, files: 644, wp-config.php: 600/640
- Local user UID/GID differs from remote server UID/GID
- Rsync from macOS to Linux (or vice versa) doesn't map users correctly
- Some hosts use non-standard permissions (shared hosting oddities)

**How to avoid:**
1. **Use --chmod to normalize permissions**
   ```bash
   # Automatically set correct WordPress permissions
   rsync -avz \
     --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r \
     user@host:/var/www/wordpress/ ./site/

   # D = directories: 755 (rwxr-xr-x)
   # F = files: 644 (rw-r--r--)
   ```

2. **Special handling for wp-config.php**
   ```bash
   # After sync, tighten wp-config.php
   chmod 600 ./site/wp-config.php
   ```

3. **Read-only analysis doesn't need write permissions**
   - For diagnostics, files can be read-only locally
   - Only matters if testing patch application locally

4. **Document permission expectations**
   - Warn users synced files may have wrong permissions
   - Provide fix command: `find ./site -type d -exec chmod 755 {} \;`

5. **--no-perms flag for diagnostic mode**
   ```bash
   # Don't preserve permissions (use local defaults)
   rsync -avz --no-perms user@host:/path/ ./local/
   ```

**Warning signs:**
- Local WordPress install can't write after sync
- Permission denied errors in local testing
- wp-config.php has 644 permissions (too permissive)
- Upload directory has 644 (should be 755)

**Phase to address:**
Phase 2 (Site Detection) - Document safe rsync permission handling

**Sources:**
- [WordPress File Permissions Explained (755 vs 644 vs 600)](https://wpthrill.com/wordpress-file-permissions-755-vs-644-vs-600/)
- [How to Set Correct WordPress File Permissions](https://jetpack.com/resources/wordpress-file-permissions/)
- [Folders and file permissions after pushing wordpress](https://github.com/welaika/wordmove/issues/354)

---

### Pitfall 7: Symlinked Plugins/Themes Break Detection

**What goes wrong:**
WordPress sites using symlinks for shared plugins/themes across multiple installs cause diagnostic tools to report incorrect paths, fail to update plugins, or miss critical files during rsync. `plugin_basename(__FILE__)` returns wrong values.

**Why it happens:**
- Developers use symlinks for multi-site management
- `wp-content/plugins/my-plugin` → `/shared/plugins/my-plugin`
- WP-CLI and WordPress core have inconsistent symlink handling
- rsync follows symlinks differently depending on flags
- Plugin updates may delete symlink targets, not just links

**How to avoid:**
1. **rsync symlink handling**
   ```bash
   # Follow symlinks and copy actual files (default)
   rsync -avzL user@host:/var/www/ ./site/

   # Preserve symlinks as links (requires both sides support)
   rsync -avz --links user@host:/var/www/ ./site/

   # Copy symlink target if remote, preserve if local
   rsync -avz --copy-unsafe-links user@host:/var/www/ ./site/
   ```

2. **Detect symlinks before analysis**
   ```bash
   # Check for symlinked plugins/themes
   ssh user@host 'find /var/www/wordpress/wp-content/{plugins,themes} -type l'
   ```

3. **Document symlink behavior**
   - Warn: "Symlinked plugins may show unexpected paths"
   - Ask: "Are you using symlinks for shared plugins/themes?"
   - Provide: "Use -L flag to resolve symlinks" option

4. **WP-CLI symlink awareness**
   - `wp plugin list` may show incorrect paths with symlinks
   - Verify with `wp plugin path <plugin>` for actual location

5. **Symlinks in production = rare**
   - Common in development, rare in production
   - If detected, flag as "advanced configuration"

**Warning signs:**
- Plugin paths start with `/shared/` or `../../`
- `rsync` shows "broken symlink" warnings
- WP-CLI plugin commands fail unexpectedly
- Update warnings: "Could not remove the old plugin"

**Phase to address:**
Phase 3 (Plugin Analysis) - Detect symlinks and adjust behavior

**Sources:**
- [Managing WordPress Development With Symlinks - Kinsta](https://kinsta.com/blog/managing-wordpress-development-with-symlinks/)
- [WordPress should not try to remove themes or plugins recursively if the directory is a symlink](https://core.trac.wordpress.org/ticket/15134)
- [Ultimate Guide 2025: WordPress Development with Symlinks](https://zalvis.com/blog/wordpress-development-with-symlinks.html)

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Storing credentials in sites.json | Faster setup, no SSH config needed | Security breach if committed/leaked | Never - always use SSH config indirection |
| Skipping --dry-run for rsync | Saves one command | Data loss from typos | Never on first run, only after verification |
| Hardcoding "wp" command path | Works on most hosts | Fails on 20%+ of hosts with custom paths | Only for personal sites, not multi-host tool |
| Syncing entire WordPress site | Complete analysis capability | Context window exhaustion, slow transfers | Only for tiny sites (<100MB) |
| Ignoring platform differences | Faster development on single OS | Commands fail on other platforms | Personal use only, document limitation |
| Using root SSH access | Bypasses permission issues | Massive security risk, violates best practices | Never - use proper user permissions |
| Storing wp-config.php in git | Easy to reference database creds | Credentials exposed in repo history | Never - use .gitignore from day 1 |
| No WP-CLI version detection | Assumes latest version available | Commands fail on older/newer hosts | Only if controlling all target hosts |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| SSH connections | Using password auth instead of keys | Ed25519 key with passphrase, stored in SSH config |
| rsync transfers | Not checking exit codes | Check `$?` after rsync, distinguish errors (1-24) |
| WP-CLI remote | Assuming ~/.bash_profile loads | Use `ssh -t` or explicit `source ~/.bash_profile` |
| MySQL via SSH | Direct connection attempt | Tunnel: `ssh -L 3306:localhost:3306 user@host` then connect |
| Large file detection | Syncing before checking size | `du -sh` check first, warn if >1GB |
| Error logs | Assuming /var/log/apache2/ | Check wp-content/debug.log, ~/logs/, and ask hosting docs |
| Plugin updates | Running `wp plugin update` directly | Read-only diagnostics shouldn't modify remote site |
| Database exports | `wp db export` without compression | Use `wp db export - | gzip > backup.sql.gz` |
| Managed WordPress hosts | Assuming standard filesystem paths | WP Engine/Kinsta/Flywheel have custom layouts |
| SSH keys | SHA-1 RSA keys (deprecated 2025) | Ed25519 keys, check host SSH version compatibility |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Syncing wp-content/uploads | rsync takes 20+ minutes, fills disk | Exclude uploads directory, only sync sample if needed | Sites with >1GB uploads |
| Reading all plugin files into Claude | Slow responses, timeouts | Analyze plugin list first, then selective file reads | Sites with 50+ plugins |
| No caching of site metadata | Re-fetch WP version every command | Cache site info in sites.json (version, PHP, WP-CLI path) | When running 10+ diagnostics |
| Syncing node_modules/vendor | Transfer 100MB+ of dependencies | Always exclude node_modules, vendor, .git | Any site with npm/composer |
| Full database export for diagnostics | 500MB+ download, context overflow | Use targeted queries: `wp db query "SELECT ..."` | Database >100MB |
| Transferring .log files | Hundreds of MB of old errors | Exclude *.log, or only sync last 1000 lines | Sites with verbose logging |
| Not using rsync compression | 10x slower over slow networks | Always use `-z` flag | Large transfers over <10Mbps |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Committing sites.json with credentials | All managed sites compromised | Add sites.json to .gitignore in Phase 1 |
| Logging SSH commands in conversation | Credentials visible in Claude history | Sanitize output, use SSH config aliases |
| Using root SSH user | Unrestricted access if compromised | Use limited user, sudo only when needed |
| Storing private keys in plugin directory | Keys committed to git | Reference keys in ~/.ssh/, never copy |
| No passphrase on SSH keys | Key theft = immediate access | Always use passphrases, use ssh-agent |
| Plain-text wp-config.php in repo | Database credentials exposed | .gitignore wp-config.php, use example file |
| Running `wp plugin install` remotely | Unexpected code execution on production | Read-only operations only, propose changes |
| No SSH key rotation | Compromised keys valid forever | Rotate keys every 90 days, document in README |
| Exposing database credentials in error messages | Credentials in logs/support tickets | Catch errors, redact before displaying |
| Using deprecated RSA SHA-1 keys | Rejected by modern hosts | Use Ed25519 keys for all new connections |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No progress indication during rsync | User thinks it's frozen, kills process | Stream rsync output with progress: `rsync --info=progress2` |
| Cryptic SSH errors | User can't fix connection issues | Detect common errors, provide helpful messages |
| Assuming WP-CLI knowledge | Users don't understand what tool does | Explain: "WP-CLI lets us query your site without FTP" |
| No size warnings before sync | User's disk fills up unexpectedly | Show size estimate, ask confirmation for >500MB |
| Silent failures | Commands fail, user gets no diagnostic | Always echo command output, explain errors |
| Requiring SSH config expertise | Users can't set up connections | Provide wizard: "Enter hostname, username, we'll create SSH config" |
| No validation before running | Typos cause destructive operations | Confirm destructive operations, show --dry-run preview |
| Assuming localhost testing | Users run against production | Warn: "This will modify PRODUCTION site - confirm (yes/no)" |
| Not explaining diagnostic findings | "Plugin X is outdated" without context | Explain impact: "Plugin X 1.2 has known security issue, update to 1.5" |
| No rollback for applied patches | User applies patch, breaks site | Generate patch files for review, not direct application |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **SSH connection works** → Often missing: Key passphrase setup in ssh-agent
- [ ] **rsync completes successfully** → Often missing: Permission normalization (--chmod)
- [ ] **WP-CLI detected** → Often missing: Version compatibility check (2.x vs 3.x)
- [ ] **Plugin list retrieved** → Often missing: Symlink detection (real vs apparent paths)
- [ ] **Diagnostics generated** → Often missing: Actionable recommendations (not just issues list)
- [ ] **Patch file created** → Often missing: Testing instructions, rollback procedure
- [ ] **sites.json created** → Often missing: .gitignore entry to prevent commit
- [ ] **Error handling added** → Often missing: User-friendly error messages
- [ ] **Documentation written** → Often missing: Platform-specific notes (macOS vs Linux)
- [ ] **Security review done** → Often missing: Credential leak audit (git log, error messages)

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Credentials committed to git | HIGH | 1. Rotate all SSH keys immediately<br>2. Change all passwords<br>3. `git filter-repo` to purge history<br>4. Force push (if private repo)<br>5. Notify all affected site owners |
| rsync --delete wiped local directory | MEDIUM | 1. Re-sync from remote (if still intact)<br>2. Restore from Time Machine/backup<br>3. Document incident, add --dry-run to docs |
| Wrong rsync path synced | LOW | 1. Delete local directory<br>2. Fix path in command<br>3. Re-run with --dry-run first |
| WP-CLI command failed (wrong path) | LOW | 1. Probe for WP-CLI: `which wp`<br>2. Store correct path in sites.json<br>3. Retry with absolute path |
| Context window exhausted | MEDIUM | 1. Delete local site directory<br>2. Restart Claude Code<br>3. Re-sync with exclusions (no uploads/cache)<br>4. Use incremental analysis |
| File permissions corrupted | LOW | 1. Fix directories: `find . -type d -exec chmod 755 {} \;`<br>2. Fix files: `find . -type f -exec chmod 644 {} \;`<br>3. Fix wp-config: `chmod 600 wp-config.php` |
| Symlinked plugin broken | LOW | 1. Use `rsync -L` to follow symlinks<br>2. Re-sync affected plugins<br>3. Document symlink usage in sites.json |
| macOS openrsync incompatibility | LOW | 1. Install GNU rsync: `brew install rsync`<br>2. Use explicit path: `/opt/homebrew/bin/rsync`<br>3. Or simplify flags to openrsync subset |
| SSH key deprecated (RSA SHA-1) | MEDIUM | 1. Generate Ed25519 key: `ssh-keygen -t ed25519`<br>2. Copy to remote: `ssh-copy-id -i ~/.ssh/id_ed25519`<br>3. Update SSH config<br>4. Test, then remove old key |
| Destructive command run on production | HIGH | 1. Restore from backup (if available)<br>2. If no backup: document damage<br>3. Add confirmation prompts to all destructive operations<br>4. Require --dry-run before --execute |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| SSH credential exposure | Phase 1: Foundation | .gitignore exists, sites.json not in git status |
| rsync --delete disasters | Phase 1: Foundation | Docs include --dry-run, exclusion examples |
| WP-CLI path assumptions | Phase 2: Site Detection | Probe WP-CLI, store path in sites.json |
| Context window exhaustion | Phase 2: Site Detection | Size check before sync, exclude uploads/cache |
| Cross-platform rsync issues | Phase 1: Foundation | Platform detection, compatible flags documented |
| File permissions corrupted | Phase 2: Site Detection | rsync uses --chmod or docs explain fix |
| Symlinked plugins break detection | Phase 3: Plugin Analysis | Detect symlinks, handle with -L flag |
| Credentials committed to git | Phase 1: Foundation | .gitignore added before sites.json creation |
| No progress indication | Phase 4: UX Polish | rsync shows progress, size estimates given |
| Silent WP-CLI failures | Phase 2: Site Detection | Check exit codes, explain errors |

---

## Sources

### SSH Security & Configuration
- [SSH Config: The Complete Guide for 2026](https://devtoolbox.dedyn.io/blog/ssh-config-complete-guide)
- [SSH Key Management Best Practices: Beyond SSH Keys](https://delinea.com/blog/ssh-key-management)
- [Best practices for protecting SSH credentials | Google Cloud](https://cloud.google.com/compute/docs/connect/ssh-best-practices/credentials)
- [SSH Security Best Practices](https://tailscale.com/learn/ssh-security-best-practices-protecting-your-remote-access-infrastructure)

### rsync Best Practices
- [Everyday rsync - VKC.sh](https://vkc.sh/everyday-rsync/)
- [How to Exclude Files and Directories with Rsync](https://linuxize.com/post/how-to-exclude-files-and-directories-with-rsync/)
- [Favorite rsync Commands for Copying WordPress Sites](https://guides.wp-bullet.com/favorite-rsync-commands-for-copying-wordpress-sites/)
- [rsync replaced with openrsync on macOS Sequoia](https://derflounder.wordpress.com/2025/04/06/rsync-replaced-with-openrsync-on-macos-sequoia/)
- [Rsync between Mac and Linux - Something Odd!](https://odd.blog/2020/10/06/rsync-between-mac-and-linux/)

### WP-CLI Remote Operations
- [Running Commands Remotely - WP-CLI](https://make.wordpress.org/cli/handbook/guides/running-commands-remotely/)
- [SSH: Allow to specify path of remote wp-cli](https://github.com/wp-cli/wp-cli/issues/5245)
- [Streamline WordPress Deployment Using WP-CLI and SSH - 2026](https://www.wewp.io/wp-cli-ssh-wordpress-deployments-2026/)

### WordPress Diagnostics & Security
- [WordPress File Permissions Explained (755 vs 644 vs 600)](https://wpthrill.com/wordpress-file-permissions-755-vs-644-vs-600/)
- [How to Set Correct WordPress File Permissions](https://jetpack.com/resources/wordpress-file-permissions/)
- [SQL Injection in WordPress – Everything You Need To Know](https://patchstack.com/articles/sql-injection/)
- [WP Doctor Diagnostic Tool](https://www.scalahosting.com/kb/how-to-diagnose-wordpress-website-issues-with-wp-doctor/)

### Symlinks & WordPress Development
- [Managing WordPress Development With Symlinks - Kinsta](https://kinsta.com/blog/managing-wordpress-development-with-symlinks/)
- [WordPress should not try to remove themes or plugins recursively if the directory is a symlink](https://core.trac.wordpress.org/ticket/15134)
- [Ultimate Guide 2025: WordPress Development with Symlinks](https://zalvis.com/blog/wordpress-development-with-symlinks.html)

### Claude Context Management
- [Claude Opus 4.6: 1 Million Token Context Window Guide](https://www.nxcode.io/resources/news/claude-1m-token-context-codebase-analysis-guide-2026)
- [A practical guide to the Claude code context window size](https://www.eesel.ai/blog/claude-code-context-window-size)
- [How Claude Code Got Better by Protecting More Context](https://hyperdev.matsuoka.com/p/how-claude-code-got-better-by-protecting)

### Credential Storage & Security
- [How Should Credentials Be Stored in JSON?](https://sourcebae.com/blog/how-should-credentials-be-stored-in-json/)
- [JSON Security Best Practices](https://jsonconsole.com/blog/json-security-best-practices-enterprise-applications)
- [How To Create A .gitignore File To Hide Your API Keys](https://medium.com/@t.rosen2101/how-to-create-a-gitignore-file-to-hide-your-api-keys-95b3e6692e41)

---

*Pitfalls research for: Claude CoWork Plugin for WordPress Remote Diagnostics*
*Researched: 2026-02-16*
