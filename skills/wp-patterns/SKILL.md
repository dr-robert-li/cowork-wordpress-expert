---
name: wp-patterns
description: Reviews WordPress architecture patterns including theme structure, plugin design, data modeling, and integration patterns. Use when evaluating custom themes/plugins architecture, data model choices, or integration design.
---

# WordPress Architecture Review

## Theme Architecture

### Child Theme Configuration
- Child theme properly configured (if extending a parent theme)
- Template hierarchy followed correctly
- `functions.php` not bloated — heavy logic moved to includes/classes
- Template parts used for reusable components
- Custom page templates registered properly
- Theme support declarations (`add_theme_support()`) appropriate
- Widget areas defined sensibly
- Navigation menus registered and used correctly
- Customizer settings sanitized and validated

## Plugin Architecture

### Main Plugin Structure
- Main plugin file structure follows WordPress conventions
- Activation/deactivation/uninstall hooks implemented
- Database tables created with `dbDelta()` and proper versioning
- Upgrade routines handle schema migrations gracefully
- Admin menu pages registered with appropriate capabilities
- Settings API used for options pages (not raw form handling)
- Plugin properly cleans up after itself on uninstall
- AJAX handlers properly registered and secured
- REST API endpoints follow WordPress conventions
- Shortcodes registered with proper escaping

## Data Architecture

### Data Model Choices
- Custom Post Types vs custom tables — appropriate choice for data model
- Post meta vs custom tables for high-volume structured data
- Taxonomies used correctly (not abused for arbitrary data)
- Options API not used for per-user or per-post data
- User meta appropriately scoped
- Multisite considerations for data isolation

### Database Schema Best Practices
- Custom tables use `dbDelta()` for creation and updates
- Proper indexing on frequently queried columns
- Foreign key relationships documented (even if not enforced)
- Column types appropriate for data (not everything as TEXT)
- Charset and collation match WordPress standards (utf8mb4)

## Integration Architecture

### External API Integration
- External API calls use WordPress HTTP API (`wp_remote_get()`, `wp_remote_post()`)
- API responses cached with transients (with appropriate expiry)
- Webhook handlers properly secured and idempotent
- Background processing uses WP-Cron or Action Scheduler appropriately
- Email sending uses `wp_mail()` with proper hooks for SMTP configuration
- Timeout values set for all HTTP requests
- Error handling for failed API calls (network issues, rate limits)
- API credentials stored securely (not in database, use constants or environment variables)

### WordPress HTTP API Patterns
```php
// Good: Using wp_remote_get with timeout and error handling
$response = wp_remote_get( 'https://api.example.com/data', [
    'timeout' => 15,
    'headers' => [
        'Authorization' => 'Bearer ' . get_option('api_key')
    ]
] );

if ( is_wp_error( $response ) ) {
    error_log( 'API request failed: ' . $response->get_error_message() );
    return false;
}

$body = wp_remote_retrieve_body( $response );
$data = json_decode( $body );

// Cache the result
set_transient( 'api_data_cache', $data, HOUR_IN_SECONDS );
```

### Background Processing
- WP-Cron used for scheduled tasks (with consideration for traffic-based triggering)
- Action Scheduler used for reliable, scalable background processing
- Long-running processes split into batches
- Progress tracking for multi-step operations
- Proper cleanup of completed/failed jobs

## WordPress CLI Diagnostics

### Core Integrity
```bash
# Verify core files against official checksums
wp core verify-checksums

# Check WordPress version
wp core version
```

### Plugin Management
```bash
# List all plugins with version and status
wp plugin list --format=csv

# Verify plugin checksums (for plugins from wordpress.org)
wp plugin verify-checksums --all
```

### Cron System Inspection
```bash
# List all scheduled cron events
wp cron event list

# List cron schedules
wp cron schedule list

# Run overdue cron events
wp cron event run --due-now
```

### Database Optimization
```bash
# Optimize database tables
wp db optimize

# Repair database tables
wp db repair

# Check database size
wp db size --tables

# Export database
wp db export
```

### Transient Cleanup
```bash
# Delete expired transients
wp transient delete --expired

# Delete all transients (nuclear option)
wp transient delete --all

# List transients
wp transient list
```

### Rewrite Rules
```bash
# Flush rewrite rules
wp rewrite flush

# List all rewrite rules
wp rewrite list

# Check rewrite structure
wp rewrite structure
```

### Performance Queries
```bash
# Check autoloaded options size (performance impact)
wp db query "SELECT option_name, LENGTH(option_value) as size FROM wp_options WHERE autoload='yes' ORDER BY size DESC LIMIT 20;"

# Count orphaned transients
wp db query "SELECT COUNT(*) FROM wp_postmeta WHERE meta_key LIKE '_transient_%';"

# Count post revisions
wp db query "SELECT COUNT(*) FROM wp_posts WHERE post_type='revision';"

# Find large post meta entries
wp db query "SELECT post_id, meta_key, LENGTH(meta_value) as size FROM wp_postmeta ORDER BY size DESC LIMIT 20;"
```

## Common Architecture Anti-Patterns

### What to Avoid
1. **Bloated functions.php** — All business logic in theme's functions.php instead of organized classes
2. **Options abuse** — Storing per-post or per-user data in wp_options table
3. **Meta query overload** — Using meta_query without proper indexing for high-volume queries
4. **Direct SQL** — Writing raw SQL instead of using $wpdb->prepare() or WordPress query APIs
5. **Template logic** — Business logic mixed into template files instead of separated
6. **No cleanup** — Plugins leaving data behind after uninstall
7. **Synchronous API calls** — Blocking page load with external API requests
8. **Global namespace pollution** — Functions and classes without proper namespacing or prefixing
9. **Hardcoded values** — Paths, URLs, or configuration hardcoded instead of using WordPress constants
10. **Missing capability checks** — Admin functionality accessible without proper permission verification
