# Testing Guide

## Overview

This boilerplate includes 25+ comprehensive tests covering:
- Configuration & environment
- Cryptography & security
- Validation schemas
- Calculator logic
- UI components
- Browser compatibility (Safari, Chrome, Firefox, Edge)
- Mobile & responsive behavior
- Edge cases & error handling

---

## Running Tests

### Run All Tests
```bash
npm run test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with UI
```bash
npm run test:ui
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Complete Test Suite
```bash
./test/run-all-tests.sh
```

---

## Test Categories

### 1. Configuration Tests (3 tests)
- Default configuration validation
- Runtime config generation
- Feature flags structure

### 2. Cryptography Tests (4 tests)
- Fingerprint generation consistency
- HMAC signature generation/verification
- IP anonymization (GDPR)

### 3. Validation Tests (4 tests)
- Email validation
- Quote data validation
- Schema defaults
- Error handling

### 4. Calculator Tests (5 tests)
- Base price calculation
- Premium pricing
- Quantity multiplication
- Data validation
- Error detection

### 5. UI Component Tests (4 tests)
- Button variants
- Input error states
- Card composition
- Component rendering

### 6. Browser Compatibility (5 tests)
- Modern browser APIs
- CSS features support
- Safari-specific tests
- Mobile Safari/iOS
- Performance APIs

---

## Browser Support

### Desktop Browsers
- ✅ Chrome 90+ (2021+)
- ✅ Firefox 88+ (2021+)
- ✅ Safari 14+ (2020+)
- ✅ Edge 90+ (2021+)

### Mobile Browsers
- ✅ iOS Safari 14+ (iPhone 6s+)
- ✅ Chrome Mobile 90+
- ✅ Samsung Internet 14+
- ✅ Firefox Mobile 88+

### Older Browser Support
- ⚠️ IE11: Not supported (Edge required)
- ⚠️ Safari < 14: Limited support
- ⚠️ iOS < 14: Limited support

---

## Coverage Goals

- **Overall:** 80%+
- **Critical paths:** 100%
- **API endpoints:** 90%+
- **UI components:** 85%+
- **Utilities:** 95%+

---

## Test Structure

```
test/
├── unit/                      # Unit tests
│   ├── config.test.ts
│   ├── validations.test.ts
│   ├── calculations.test.ts
│   ├── fingerprint.test.ts
│   └── components.test.tsx
├── integration/               # Integration tests
│   ├── api-endpoints.test.ts
│   ├── save-quote.test.ts
│   └── full-flow.test.ts
├── compatibility/             # Browser compatibility
│   ├── browser-compatibility.test.ts
│   └── mobile-responsive.test.ts
├── comprehensive/             # Complete test suite
│   └── complete-test-suite.test.ts
└── setup.ts                  # Test configuration
```

---

## Writing New Tests

### Unit Test Template

```typescript
import { describe, it, expect } from 'vitest';
import { myFunction } from '@/lib/utils';

describe('My Feature', () => {
  it('should do something correctly', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });

  it('should handle errors gracefully', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### Component Test Template

```typescript
import { render, fireEvent } from '@testing-library/react';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('should render correctly', () => {
    const { container } = render(<MyComponent />);
    expect(container).toBeTruthy();
  });

  it('should handle user interaction', () => {
    const handleClick = vi.fn();
    const { getByText } = render(
      <MyComponent onClick={handleClick} />
    );
    
    fireEvent.click(getByText('Click me'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

---

## CI/CD Integration

Tests run automatically on:
- Every commit (pre-commit hook)
- Every pull request (GitHub Actions)
- Before deployment (CD pipeline)

---

## Troubleshooting

### Tests Fail Locally

```bash
# Clear cache
rm -rf node_modules .astro
npm install

# Run tests again
npm run test
```

### Coverage Too Low

```bash
# Generate detailed coverage report
npm run test:coverage

# Open HTML report
open coverage/index.html
```

### Browser Compatibility Issues

```bash
# Run compatibility tests specifically
npm run test -- compatibility
```
