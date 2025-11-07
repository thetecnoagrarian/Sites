# Playwright E2E Tests

This directory contains end-to-end tests for The Tecnoagrarian and Fruition Forest Garden sites using Playwright.

## Quick Start

```bash
# Run all tests
npm run test:e2e

# Run tests with UI mode (interactive)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Debug tests
npm run test:e2e:debug

# View test report
npm run test:e2e:report
```

## Test Files

- **categories-modal.spec.js** - Tests for the categories dropdown/modal on mobile and desktop
- **homepage.spec.js** - Basic homepage functionality tests
- **responsive.spec.js** - Responsive design and viewport tests

## Configuration

Tests are configured in `playwright.config.js` to run against:
- Chromium (Chrome/Edge)
- Firefox
- WebKit (Safari)
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

## Test URLs

By default, tests run against `http://localhost:4002` (The Tecnoagrarian).

To test against production or other URLs, set the `TEST_URL` environment variable:

```bash
TEST_URL=https://thetecnoagrarian.com npm run test:e2e
```

## Screenshots

Screenshots are automatically saved to `tests/screenshots/` when tests fail or when explicitly taken in tests.

## What These Tests Do

1. **Categories Modal Tests**: Verify the bottom sheet modal works correctly on mobile, stays centered, opens/closes properly, and displays categories correctly
2. **Homepage Tests**: Check that the page loads, navigation works, search is functional, and there are no console errors
3. **Responsive Tests**: Ensure the site renders correctly across different viewport sizes

## Benefits

- **Automated Testing**: Catch bugs before they reach production
- **Visual Regression**: Screenshots help identify visual issues
- **Cross-Browser**: Test in multiple browsers automatically
- **Mobile Testing**: Verify mobile experience without a physical device
- **Better Debugging**: Get detailed error messages, screenshots, and traces when tests fail

