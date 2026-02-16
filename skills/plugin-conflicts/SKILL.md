---
name: plugin-conflicts
description: Identifies and resolves conflicts between WordPress plugins and themes. Use when debugging plugin conflicts, theme switching issues, or JavaScript/CSS collisions.
---

# Domain 4: Plugin & Theme Conflict Resolution

## 4.1 Conflict Identification

- Hook priority collisions (same hook, same priority, conflicting behavior)
- JavaScript global namespace pollution
- CSS specificity wars between plugins/themes
- Shared library version conflicts (e.g., different jQuery UI versions)
- REST API route collisions
- Custom post type / taxonomy slug conflicts
- Cron job interference
- Session handling conflicts
- Object cache key collisions

## 4.2 Systematic Conflict Testing

- Binary search isolation: disable half the plugins, narrow down
- Theme switching test (to default theme like Twenty Twenty-Four)
- Browser console error analysis
- PHP error log analysis during activation/deactivation cycles
- Database state comparison before/after plugin activation
- REST API endpoint testing in isolation

## 4.3 Common Conflict Patterns

- Page builders fighting over editor hooks
- SEO plugins duplicating meta tags
- Security plugins blocking legitimate AJAX requests
- Caching plugins serving stale content for dynamic features
- Translation plugins conflicting with multilingual setups
- WooCommerce template overrides breaking after updates
- Multiple plugins enqueueing different versions of the same library

---

## Systematic Conflict Resolution Process

### Step 1: Reproduce the Issue

1. Document exact steps to trigger the problem
2. Note which user role experiences the issue
3. Check browser console for JavaScript errors
4. Check PHP error logs for warnings/fatals
5. Test in incognito/private browsing mode (rules out caching)

### Step 2: Binary Search Plugin Isolation

```bash
# Get list of active plugins
wp plugin list --status=active --field=name

# Disable all plugins
wp plugin deactivate --all

# Test if issue is resolved
# If yes, it's a plugin conflict. Proceed with binary search.

# Enable half the plugins
wp plugin activate plugin1 plugin2 plugin3

# Test again. If issue returns, conflict is in this half.
# If issue doesn't return, conflict is in the other half.

# Repeat until you isolate the conflicting plugin(s)
```

### Step 3: Theme Test

```bash
# Switch to a default WordPress theme
wp theme activate twentytwentyfour

# Test if issue persists
# If resolved, conflict is theme-related
```

### Step 4: Analyze the Conflict

Once you've identified the conflicting plugins/theme:

1. Check for hook priority collisions:
   ```bash
   # Search for same hook usage in conflicting plugins
   grep -rn "add_action('init'" plugin1/ plugin2/
   grep -rn "add_filter('the_content'" plugin1/ plugin2/
   ```

2. Check for JavaScript conflicts:
   - Open browser console
   - Look for namespace collisions (global variables)
   - Check for competing event handlers

3. Check for CSS conflicts:
   - Use browser inspector to identify specificity issues
   - Look for `!important` overuse
   - Check for inline styles overriding plugin styles

### Step 5: Implement Resolution

**For hook priority collisions:**
```php
// Adjust hook priority to run before/after conflicting plugin
add_action('init', 'my_function', 5);  // Lower number = earlier execution
add_action('init', 'my_function', 999); // Higher number = later execution
```

**For JavaScript conflicts:**
```javascript
// Wrap in IIFE to avoid global namespace pollution
(function($) {
    // Your code here
})(jQuery);
```

**For CSS conflicts:**
```css
/* Increase specificity without !important */
.my-plugin-wrapper .my-element {
    /* styles */
}

/* Or use :where() for lower specificity that's easier to override */
:where(.my-plugin) .my-element {
    /* styles */
}
```

---

## Tool Usage: Conflict Resolution Commands

### Plugin Management

```bash
# List all active plugins
wp plugin list --status=active

# Deactivate all plugins
wp plugin deactivate --all

# Activate specific plugins
wp plugin activate plugin-name

# Get plugin details
wp plugin get plugin-name

# Search for plugins by keyword
wp plugin search conflict-checker
```

### Theme Management

```bash
# List available themes
wp theme list

# Switch to default theme for testing
wp theme activate twentytwentyfour

# Get current theme details
wp theme get
```

### Debugging

```bash
# Enable debug mode
wp config set WP_DEBUG true --raw
wp config set WP_DEBUG_LOG true --raw
wp config set WP_DEBUG_DISPLAY false --raw

# Tail the debug log
tail -f wp-content/debug.log

# Disable debug mode after testing
wp config set WP_DEBUG false --raw
```
