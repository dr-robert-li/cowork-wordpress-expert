---
name: accessibility
description: Evaluates WordPress sites against WCAG compliance and data privacy requirements. Use when auditing accessibility, reviewing GDPR compliance, or checking privacy implementations.
---

# Accessibility & Compliance

## WCAG Compliance

### Heading Hierarchy
- Proper semantic heading structure (h1 → h2 → h3, no skipping levels)
- Only one h1 per page (typically the page title)
- Headings used for structure, not styling (no "heading because it looks bold")
- Theme templates follow logical heading progression
- Page builders don't break heading hierarchy with out-of-order elements
- Skip links provided for keyboard navigation to main content
- Landmark regions properly defined (header, nav, main, aside, footer)

### Image Accessibility
- All content images have descriptive alt text
- Decorative images have empty alt attribute (`alt=""`)
- Complex images (charts, diagrams) have longer descriptions via aria-describedby or adjacent text
- Image upload interfaces prompt for alt text
- Featured images have alt text handling
- CSS background images not used for content (only decoration)
- SVG images include title and desc elements where appropriate

### Form Accessibility
- Every form input has an associated label (explicit with `for` attribute or implicit wrapping)
- Required fields indicated both visually and semantically (aria-required="true")
- Error messages associated with inputs via aria-describedby
- Fieldsets and legends used for grouped form controls (radio buttons, checkboxes)
- Placeholder text not used as the only label (placeholders disappear on input)
- Focus states clearly visible on all interactive elements
- Form validation provides clear, specific error messages
- Submit buttons have descriptive text (not just "Submit" or "Go")

### Color and Contrast
- Text color contrast ratios meet WCAG AA standards:
  - Normal text: 4.5:1 minimum
  - Large text (18pt+/14pt+ bold): 3:1 minimum
  - AAA standards: 7:1 for normal, 4.5:1 for large
- Color not used as the only means of conveying information
- Link text distinguishable from surrounding text (underline, icon, or sufficient contrast difference)
- Focus indicators have sufficient contrast (3:1 minimum against background)
- UI component states (disabled, selected, hovered) have sufficient contrast

### Keyboard Navigation
- All interactive elements accessible via keyboard (Tab, Enter, Space, Arrow keys)
- Logical tab order follows visual flow
- Keyboard focus indicator always visible (not removed with CSS)
- Modal dialogs trap focus and return focus on close
- Dropdown menus accessible with keyboard (Escape to close, Arrow keys to navigate)
- Custom JavaScript interactions include keyboard event handlers (not just mouse events)
- Skip navigation links provided for repetitive content

### ARIA Attributes
- ARIA roles used appropriately (navigation, search, banner, contentinfo, complementary)
- ARIA labels provided for icon-only buttons (`aria-label="Close"`)
- ARIA live regions for dynamic content updates (notifications, loading states)
- ARIA expanded/collapsed states for accordions and dropdowns
- ARIA hidden used to remove decorative elements from screen reader flow
- ARIA describedby used to associate help text with form fields
- ARIA current used to indicate current page in navigation
- Custom widgets (tabs, accordions, sliders) follow WAI-ARIA authoring practices

### Screen Reader Compatibility
- Logical reading order (visual order matches DOM order)
- Dynamic content changes announced to screen readers
- Loading states communicated (spinner with "Loading..." text for screen readers)
- Breadcrumbs and pagination semantically marked up
- Tables use proper markup (th, scope, caption) for data tables
- Lists use proper markup (ul, ol, li) for list content
- Language of page specified in html lang attribute
- Language changes within content marked with lang attribute

### Media Accessibility
- Video content includes captions/subtitles
- Audio content includes transcripts
- Auto-playing media can be paused
- Media controls keyboard accessible
- Volume controls available
- No flashing content that could trigger seizures (3 flashes per second threshold)

## Data Privacy

### GDPR Compliance

#### Consent Mechanisms
- Clear, affirmative consent required before collecting personal data
- Consent request uses plain language (not legal jargon)
- Pre-ticked checkboxes not used for consent
- Separate consent for different processing purposes (not bundled)
- Easy to withdraw consent (as easy as giving it)
- Records of consent maintained (who, when, what they consented to)
- Cookie consent banner appears before any tracking cookies set
- Essential cookies documented and explained

#### Data Export (Right to Access)
- WordPress personal data export tool utilized
- Custom plugin data registered with `wp_register_privacy_exporter()`
- Export includes all personal data held about the user
- Export provided in machine-readable format (JSON/XML)
- Export delivered within 30 days (GDPR requirement)
- Identity verification before providing export

#### Data Erasure (Right to Be Forgotten)
- WordPress personal data erasure tool utilized
- Custom plugin data registered with `wp_register_privacy_eraser()`
- User accounts and associated data can be permanently deleted
- Data erasure cascades to comments, orders, form submissions, etc.
- Backup retention policy documented
- Legal hold exceptions documented (e.g., accounting records)
- Confirmation provided when erasure complete

#### Privacy Policy Integration
- Privacy policy page created and linked in WordPress settings
- Privacy policy explains:
  - What data is collected
  - Why it's collected (legal basis)
  - How long it's retained
  - Who it's shared with
  - User rights (access, erasure, portability, objection)
  - Contact information for privacy requests
- Policy written in plain language
- Policy updated when data practices change
- Policy versioned with effective dates

### Cookie Consent Implementation

#### Cookie Categories
- **Essential cookies** — Session management, security, user preferences (no consent required)
- **Functional cookies** — Enhanced features (consent required)
- **Analytics cookies** — Usage tracking (consent required)
- **Marketing cookies** — Advertising, retargeting (consent required)

#### Consent Banner Requirements
- Banner appears before any non-essential cookies set
- Clear explanation of each cookie category
- Granular consent options (not just "Accept All")
- "Reject All" option as prominent as "Accept All"
- Banner accessible (keyboard navigable, screen reader friendly)
- Consent preferences saved and respected across sessions
- Easy to change consent preferences later (link in footer)

### Personal Data Handling in Custom Plugins

#### Data Registration
```php
// Register personal data exporter
function my_plugin_register_exporter( $exporters ) {
    $exporters['my-plugin-data'] = array(
        'exporter_friendly_name' => __( 'My Plugin Data' ),
        'callback' => 'my_plugin_exporter',
    );
    return $exporters;
}
add_filter( 'wp_privacy_personal_data_exporters', 'my_plugin_register_exporter' );

// Register personal data eraser
function my_plugin_register_eraser( $erasers ) {
    $erasers['my-plugin-data'] = array(
        'eraser_friendly_name' => __( 'My Plugin Data' ),
        'callback' => 'my_plugin_eraser',
    );
    return $erasers;
}
add_filter( 'wp_privacy_personal_data_erasers', 'my_plugin_register_eraser' );
```

#### Data Minimization
- Only collect data that is necessary for the stated purpose
- Don't collect "just in case" data
- Use pseudonymization where full identification not required
- Implement data retention limits (auto-delete old records)
- Regular audits of what data is stored and why

### Data Retention Policies

#### Implementation
- Document retention periods for different data types
- Automated cleanup of expired data (WP-Cron job)
- User notification before data deletion (if applicable)
- Exception handling for legal holds
- Audit logs of data deletion (for compliance proof)

#### Common Retention Periods
- User accounts: Until user requests deletion or after 2+ years inactivity
- Comments: Indefinitely (unless user requests deletion)
- Form submissions: 90 days to 1 year (business need dependent)
- Analytics data: Aggregated after 14 months (GDPR recommendation)
- Log files: 30-90 days maximum

### Third-Party Tracking Scripts

#### Disclosure Requirements
- All third-party scripts disclosed in privacy policy
- Purpose of each script explained
- Data sharing described
- Links to third-party privacy policies
- User consent obtained before loading tracking scripts

#### Common Third-Party Scripts to Audit
- Google Analytics / Google Tag Manager
- Facebook Pixel
- HotJar / Crazy Egg / FullStory (session recording)
- Live chat widgets (Intercom, Drift, etc.)
- Email marketing pixels (Mailchimp, etc.)
- Social media sharing buttons (may load tracking)
- Embedded content (YouTube, Vimeo — may set cookies)
- Payment gateway scripts (Stripe, PayPal)

#### Privacy-Friendly Alternatives
- Self-hosted analytics (Matomo, Plausible, Fathom)
- Cookie-less tracking methods
- Proxying third-party scripts through own domain
- Loading third-party resources only after consent

## Compliance Auditing Checklist

### Accessibility Quick Check
1. Run automated scan (WAVE, axe DevTools, Lighthouse)
2. Navigate site with keyboard only (Tab, Enter, Escape)
3. Test with screen reader (NVDA, JAWS, VoiceOver)
4. Check color contrast (browser dev tools or Contrast Checker)
5. Resize text to 200% and verify readability
6. Disable CSS and verify content order makes sense
7. Test forms for proper labels and error handling
8. Check that all functionality available to keyboard users

### GDPR Quick Check
1. Privacy policy exists, is linked, and is current
2. Cookie consent banner functions correctly
3. User can export their personal data
4. User can request data deletion
5. Forms explain why data is being collected
6. Third-party scripts disclosed in privacy policy
7. Data retention policy documented
8. Custom plugin data registered with privacy tools

## Resources and Tools

### Accessibility Testing Tools
- **WAVE** (browser extension) — Visual feedback on accessibility issues
- **axe DevTools** (browser extension) — Detailed accessibility testing
- **Lighthouse** (Chrome DevTools) — Automated audits including accessibility
- **NVDA** (Windows) / **VoiceOver** (Mac) — Screen reader testing
- **Colour Contrast Analyser** — WCAG contrast ratio checking
- **HeadingsMap** — Verify heading structure

### GDPR Compliance Tools
- **WordPress Privacy Tools** — Built-in export/erasure functionality
- **Cookie Notice & Compliance** (plugin) — GDPR-compliant cookie consent
- **Complianz** (plugin) — Multi-law compliance (GDPR, CCPA, ePrivacy)
- **Data Request Form** — Built into WordPress (Tools > Export Personal Data / Erase Personal Data)

### Validation
- **W3C Validator** — HTML validation (accessibility depends on valid markup)
- **WAI-ARIA Authoring Practices** — Reference for custom widget patterns
- **WCAG Quick Reference** — Searchable WCAG 2.1 guidelines
