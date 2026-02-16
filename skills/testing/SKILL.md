---
name: testing
description: Guides WordPress testing strategy including PHPUnit with WP_UnitTestCase, test categories, coverage targets, and test design principles. Use when writing tests, setting up test infrastructure, or reviewing test coverage.
---

# WordPress Testing Framework

## Unit Testing Strategy

For all custom code (themes and plugins), design and maintain tests using PHPUnit with the WordPress test framework (`WP_UnitTestCase`).

### Test Coverage Targets

- **Critical paths:** 100% coverage (authentication, payment, data mutation)
- **Business logic:** 95%+ coverage
- **Helper/utility functions:** 90%+ coverage
- **Template rendering:** Integration tests for critical templates
- **Overall target:** As close to 100% as practical

## Test Categories

```
tests/
├── unit/                    # Pure unit tests (no WordPress dependencies)
│   ├── Validators/          # Input validation functions
│   ├── Formatters/          # Data formatting/transformation
│   └── Calculators/         # Business logic calculations
├── integration/             # Tests requiring WordPress (WP_UnitTestCase)
│   ├── PostTypes/           # Custom post type registration & behavior
│   ├── Taxonomies/          # Custom taxonomy behavior
│   ├── AJAX/                # AJAX handler tests
│   ├── REST/                # REST API endpoint tests
│   ├── Database/            # Custom table operations
│   ├── Hooks/               # Filter and action behavior
│   └── Admin/               # Admin page functionality
├── security/                # Security-specific tests
│   ├── Nonce/               # CSRF protection verification
│   ├── Capability/          # Authorization checks
│   ├── Sanitization/        # Input sanitization coverage
│   ├── Escaping/            # Output escaping coverage
│   └── SQLInjection/        # SQL injection resistance
├── performance/             # Performance regression tests
│   ├── QueryCount/          # Database query count assertions
│   ├── MemoryUsage/         # Memory consumption limits
│   └── ExecutionTime/       # Execution time thresholds
└── e2e/                     # End-to-end tests (Cypress/Playwright)
    ├── Frontend/            # User-facing functionality
    ├── Admin/               # Dashboard functionality
    └── Forms/               # Form submission flows
```

## Test Design Principles

### 1. Arrange-Act-Assert Pattern
Every test should follow the AAA pattern:
```php
public function test_user_can_save_settings() {
    // Arrange: Set up test conditions
    $user_id = $this->factory->user->create( [ 'role' => 'administrator' ] );
    wp_set_current_user( $user_id );
    $_POST['settings_nonce'] = wp_create_nonce( 'save_settings' );
    $_POST['settings'] = [ 'option_a' => 'value_a' ];

    // Act: Perform the action
    $result = save_settings_handler();

    // Assert: Verify the outcome
    $this->assertTrue( $result );
    $this->assertEquals( 'value_a', get_option( 'option_a' ) );
}
```

### 2. One Behavior Per Test
Each test method tests ONE behavior. If you need "and" in your test name, you probably need two tests.

**Good:**
```php
public function test_unauthenticated_user_cannot_access_admin_ajax() { }
public function test_authenticated_user_can_access_admin_ajax() { }
```

**Bad:**
```php
public function test_ajax_authentication_and_response() { }
```

### 3. Descriptive Test Names
Test names should describe the expected behavior in plain English:
```php
public function test_post_with_missing_title_returns_validation_error() { }
public function test_expired_transient_returns_false() { }
public function test_admin_notice_appears_after_successful_save() { }
```

### 4. Use Data Providers
For testing multiple inputs against the same logic:
```php
/**
 * @dataProvider invalid_email_provider
 */
public function test_invalid_email_returns_error( $email ) {
    $result = validate_email( $email );
    $this->assertWPError( $result );
}

public function invalid_email_provider() {
    return [
        'missing_at_sign' => [ 'notanemail.com' ],
        'missing_domain' => [ 'test@' ],
        'spaces' => [ 'test @example.com' ],
        'empty_string' => [ '' ],
    ];
}
```

### 5. Mock External Dependencies
Don't make real HTTP requests or file system operations in tests:
```php
public function test_api_call_handles_timeout() {
    // Mock wp_remote_get to simulate timeout
    add_filter( 'pre_http_request', function( $preempt, $args, $url ) {
        return new WP_Error( 'http_request_failed', 'Operation timed out' );
    }, 10, 3 );

    $result = fetch_api_data();

    $this->assertFalse( $result );
}
```

### 6. Use WordPress Factory Methods
Leverage WordPress test framework factories for creating test data:
```php
// Create posts
$post_id = $this->factory->post->create( [
    'post_title' => 'Test Post',
    'post_type' => 'custom_type',
] );

// Create users
$user_id = $this->factory->user->create( [ 'role' => 'editor' ] );

// Create terms
$term_id = $this->factory->term->create( [
    'taxonomy' => 'category',
    'name' => 'Test Category',
] );
```

### 7. Clean Up After Tests
Use `setUp()` and `tearDown()` to ensure test isolation:
```php
public function setUp(): void {
    parent::setUp();
    // Set up test conditions before each test
    $this->admin_user = $this->factory->user->create( [ 'role' => 'administrator' ] );
}

public function tearDown(): void {
    // Clean up after each test
    wp_set_current_user( 0 );
    parent::tearDown();
}
```

### 8. Test-Driven Bugfixing
Write tests for the bug BEFORE writing the fix:
1. Write a failing test that reproduces the bug
2. Verify the test fails
3. Fix the bug
4. Verify the test passes
5. Run all tests to ensure no regressions

## Iterative Test Review Process

After each change:

1. **Run full test suite** — all existing tests must pass
2. **Review existing tests** — verify they still test the right thing (logic may have changed)
3. **Add new tests** — for new functionality
4. **Check coverage report** — identify untested paths
5. **Update test documentation** — keep test README current

## Configuration Files

### phpunit.xml.dist

```xml
<phpunit
    bootstrap="tests/bootstrap.php"
    colors="true"
    convertErrorsToExceptions="true"
    convertNoticesToExceptions="true"
    convertWarningsToExceptions="true">
    <testsuites>
        <testsuite name="unit">
            <directory suffix="Test.php">./tests/unit/</directory>
        </testsuite>
        <testsuite name="integration">
            <directory suffix="Test.php">./tests/integration/</directory>
        </testsuite>
        <testsuite name="security">
            <directory suffix="Test.php">./tests/security/</directory>
        </testsuite>
        <testsuite name="performance">
            <directory suffix="Test.php">./tests/performance/</directory>
        </testsuite>
    </testsuites>
    <coverage>
        <include>
            <directory suffix=".php">./src/</directory>
            <directory suffix=".php">./includes/</directory>
        </include>
        <exclude>
            <directory suffix=".php">./vendor/</directory>
            <directory suffix=".php">./tests/</directory>
        </exclude>
        <report>
            <html outputDirectory="tests/coverage/html"/>
            <clover outputFile="tests/coverage/clover.xml"/>
        </report>
    </coverage>
</phpunit>
```

## WordPress-Specific Testing Patterns

### Testing Hooks
```php
public function test_filter_modifies_post_title() {
    $original_title = 'Original Title';
    $filtered_title = apply_filters( 'my_plugin_post_title', $original_title );

    $this->assertEquals( 'Modified: Original Title', $filtered_title );
}

public function test_action_sends_email() {
    // Use a test mailer
    $mailer = tests_retrieve_phpmailer_instance();

    do_action( 'my_plugin_send_notification', 'user@example.com' );

    $this->assertEquals( 'user@example.com', $mailer->get_recipient( 'to' )->address );
}
```

### Testing AJAX Handlers
```php
public function test_ajax_handler_requires_nonce() {
    // Simulate AJAX request without nonce
    try {
        $this->_handleAjax( 'my_ajax_action' );
    } catch ( WPAjaxDieContinueException $e ) {
        // Expected to die with -1 (nonce failure)
    }

    $response = json_decode( $this->_last_response );
    $this->assertEquals( -1, $response );
}
```

### Testing REST API Endpoints
```php
public function test_rest_endpoint_requires_authentication() {
    $request = new WP_REST_Request( 'POST', '/my-plugin/v1/data' );
    $response = rest_do_request( $request );

    $this->assertEquals( 401, $response->get_status() );
}

public function test_rest_endpoint_returns_valid_data() {
    $user_id = $this->factory->user->create( [ 'role' => 'administrator' ] );
    wp_set_current_user( $user_id );

    $request = new WP_REST_Request( 'GET', '/my-plugin/v1/data' );
    $response = rest_do_request( $request );

    $this->assertEquals( 200, $response->get_status() );
    $this->assertArrayHasKey( 'data', $response->get_data() );
}
```

### Testing Database Operations
```php
public function test_custom_table_created_on_activation() {
    global $wpdb;

    $table_name = $wpdb->prefix . 'my_custom_table';

    my_plugin_activation_hook();

    $this->assertEquals( $table_name, $wpdb->get_var( "SHOW TABLES LIKE '{$table_name}'" ) );
}
```

## Running Tests

### Command Line
```bash
# Run all tests
phpunit

# Run specific test suite
phpunit --testsuite=unit
phpunit --testsuite=integration
phpunit --testsuite=security

# Run specific test file
phpunit tests/unit/Validators/EmailValidatorTest.php

# Run with coverage report
phpunit --coverage-html tests/coverage/html

# Run with code coverage filter
phpunit --filter test_specific_method
```

### Continuous Integration
Integrate with CI/CD pipelines (GitHub Actions, GitLab CI, etc.):
```yaml
# .github/workflows/tests.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:8.0
    steps:
      - uses: actions/checkout@v2
      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.2'
      - name: Install dependencies
        run: composer install
      - name: Run tests
        run: phpunit --coverage-clover coverage.xml
```

## Test Coverage Analysis

### Coverage Goals
- Aim for high coverage but prioritize critical paths
- 100% coverage on security-sensitive code
- Lower coverage acceptable for simple getters/setters

### Coverage Reports
```bash
# Generate HTML coverage report
phpunit --coverage-html tests/coverage/html

# View in browser
open tests/coverage/html/index.html

# Generate coverage summary
phpunit --coverage-text

# Check coverage threshold (fail if below 80%)
phpunit --coverage-text --coverage-clover=coverage.xml --coverage-threshold=80
```

## Best Practices Summary

1. **Write tests first** (TDD) or alongside implementation
2. **One assertion per test** (when possible)
3. **Test behavior, not implementation**
4. **Keep tests fast** (mock external dependencies)
5. **Make tests readable** (clear AAA pattern, descriptive names)
6. **Isolate tests** (no dependencies between tests)
7. **Test edge cases** (null, empty, invalid inputs)
8. **Test error conditions** (not just happy paths)
9. **Review and refactor tests** (as you refactor code)
10. **Run tests before committing** (ensure no regressions)
