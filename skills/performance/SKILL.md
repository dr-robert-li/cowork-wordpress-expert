---
name: performance
description: Analyzes WordPress performance across database queries, PHP execution, frontend rendering, and caching layers. Use when investigating slow pages, optimizing load times, or reviewing caching strategy.
---

# Domain 3: Performance Analysis

## 3.1 Database Performance

- Identify N+1 query patterns (queries inside loops)
- Flag `meta_query` without proper indexing
- Detect unnecessary `LIKE '%value%'` queries (leading wildcard prevents index use)
- Check for missing indexes on custom tables
- Identify excessive `wp_options` autoloading (total autoloaded data size)
- Review transient usage — orphaned or never-expiring transients
- Detect `SELECT *` where specific columns would suffice
- Flag `ORDER BY RAND()` on large datasets
- Check post revision accumulation and recommend limits
- Review `wp_postmeta` table bloat

## 3.2 PHP Performance

- Identify expensive operations in `init`, `wp_loaded`, or `admin_init` hooks that should run conditionally
- Detect heavy computation on every page load vs lazy/on-demand execution
- Flag blocking HTTP API calls without timeouts
- Identify missing object caching for repeated expensive operations
- Check for excessive use of `get_option()` on non-autoloaded options (each triggers a DB query)
- Detect memory-intensive operations (loading all posts, large arrays in memory)
- Review cron jobs for efficiency and proper scheduling
- Identify duplicate plugin functionality (multiple SEO plugins, multiple caching layers)

## 3.3 Frontend Performance

- Audit render-blocking CSS and JavaScript
- Check proper use of `wp_enqueue_script()` / `wp_enqueue_style()` (not hardcoded in templates)
- Verify scripts load in footer where possible (`in_footer` parameter)
- Identify scripts/styles loaded globally that should be conditional
- Check for proper async/defer attributes
- Review image optimization (WebP support, proper sizing, lazy loading)
- Identify excessive DOM size from page builder bloat
- Check for unused CSS/JS being loaded
- Verify proper use of WordPress asset dependency system
- Core Web Vitals impact assessment (LCP, FID/INP, CLS)

## 3.4 Caching Analysis

- Page caching configuration and effectiveness
- Object caching (Redis/Memcached) configuration
- Browser caching headers (Cache-Control, Expires, ETag)
- CDN configuration and cache hit rates
- Fragment caching for dynamic content areas
- Transient API usage patterns
- OPcache configuration for PHP

---

## Tool Usage: Performance Analysis Commands

### Database Analysis

```bash
# Analyze autoloaded options size
wp db query "SELECT option_name, LENGTH(option_value) as size FROM wp_options WHERE autoload='yes' ORDER BY size DESC LIMIT 20;"

# Count orphaned transients
wp db query "SELECT COUNT(*) FROM wp_postmeta WHERE meta_key LIKE '_transient_%';"

# Count post revisions
wp db query "SELECT COUNT(*) FROM wp_posts WHERE post_type='revision';"

# Analyze wp_postmeta table size
wp db query "SELECT COUNT(*) as total_rows, SUM(LENGTH(meta_value)) as total_size FROM wp_postmeta;"

# Find slow queries (requires query log enabled)
wp db query "SELECT * FROM mysql.slow_log ORDER BY query_time DESC LIMIT 10;"
```

### WordPress CLI Diagnostics

```bash
# Database optimization
wp db optimize
wp db repair

# Transient cleanup
wp transient delete --expired
wp transient delete --all

# Cron inspection
wp cron event list
wp cron schedule list

# Cache management
wp cache flush
wp cache type  # Show cache type (Redis, Memcached, etc.)
```

### Query Monitoring

```bash
# Enable Query Monitor plugin for development
wp plugin install query-monitor --activate

# Check for slow queries in debug log
tail -f /path/to/wp-content/debug.log | grep "Slow query"
```
