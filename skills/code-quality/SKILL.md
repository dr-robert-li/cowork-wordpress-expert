---
name: code-quality
description: Reviews WordPress code against WPCS standards, static analysis, architecture patterns, and error handling. Use when analyzing custom themes/plugins, checking coding standards, or reviewing code architecture.
---

# Domain 2: Code Quality & Standards

## 2.1 WordPress Coding Standards (WPCS)

- PHP code adheres to WordPress PHP Coding Standards
- JavaScript follows WordPress JS Coding Standards
- CSS follows WordPress CSS Coding Standards
- HTML follows WordPress HTML Coding Standards
- Yoda conditions used for comparisons (`if ( true === $var )`)
- Proper indentation (tabs, not spaces for PHP; as per standard for JS/CSS)
- PHPDoc blocks present for all functions, classes, methods, hooks
- Text domain consistency for internationalization

## 2.2 Static Analysis

- PHPCS with WordPress-Extra and WordPress-VIP-Go rulesets
- PHPStan at level 6+ (ideally max) with WordPress extensions
- Psalm analysis for type safety
- ESLint for JavaScript with WordPress preset
- Stylelint for CSS/SCSS

## 2.3 Architecture & Design Patterns

- Proper use of WordPress hooks system (actions and filters) — no function overriding via copy-paste
- Single Responsibility Principle in custom classes
- Proper namespacing to avoid function/class name collisions
- Autoloading via PSR-4 or WordPress-compatible patterns
- Data validation at boundaries (input validation, output escaping)
- Proper separation of concerns (business logic vs presentation)
- No business logic in template files
- Proper use of WordPress transients API for caching expensive operations
- Custom post types and taxonomies registered correctly with appropriate capabilities
- Options API used correctly (autoloaded only when necessary)

## 2.4 Error Handling

- Try/catch blocks around operations that can fail (API calls, file operations, database)
- WordPress error pattern: return `WP_Error` objects rather than `false` or exceptions for API boundaries
- Error conditions handled gracefully — no white screens
- Admin notices for recoverable errors
- Logging for non-recoverable errors without exposing details to users

## 2.5 Deprecated & Removed Functions

- No use of functions deprecated in current WordPress version
- No use of PHP functions deprecated in current PHP version
- No use of MySQL functions replaced by MySQLi/PDO
- `mysql_*` functions completely absent
- `create_function()` replaced with closures
- `each()` replaced with `foreach`

---

## Tool Usage: Code Quality Analysis Commands

### WordPress Coding Standards

```bash
# Install WordPress Coding Standards
composer require --dev wp-coding-standards/wpcs

# Run PHPCS with WordPress standards
phpcs --standard=WordPress /path/to/plugin-or-theme

# Run with specific rulesets
phpcs --standard=WordPress-Extra /path/to/plugin
phpcs --standard=WordPress-VIP-Go /path/to/plugin
```

### Static Analysis Tools

```bash
# PHPStan (static analysis)
composer require --dev phpstan/phpstan szepeviktor/phpstan-wordpress
phpstan analyse --level=max /path/to/src

# Psalm (type safety)
composer require --dev vimeo/psalm
psalm --init
psalm

# PHP Linting (syntax check)
find /path/to/plugin -name "*.php" -exec php -l {} \;
```

### JavaScript and CSS

```bash
# ESLint with WordPress preset
npm install --save-dev eslint @wordpress/eslint-plugin
eslint /path/to/js-files

# Stylelint for CSS
npm install --save-dev stylelint stylelint-config-wordpress
stylelint "**/*.css"
```
