# Testing

## Verification Flow

Before claiming any change is complete:

1. **Unit tests**: `pnpm test`
2. **Type check**: `npx tsc --noEmit`
3. **Build**: `pnpm build`
4. **Smoke test**: verify core user flows in browser

## Unit Tests

- Framework: Vitest
- Run: `pnpm test`
- Watch mode: `pnpm test -- --watch`
- Coverage: `pnpm test -- --coverage`

## E2E Tests

- Framework: Vitest + Playwright
- Run: `pnpm test:e2e`
- Screenshots saved to: `e2e/screenshots/`

## Writing Tests

- Co-locate unit tests in `src/__tests__/`
- E2E tests in `e2e/`
- Use fixtures from `src/__tests__/fixtures.ts`
- When refactoring: write tests BEFORE changing code

## Smoke Test Checklist

<!-- Add core user flows here as the project evolves -->

- [ ] App loads without errors
- [ ] No console errors in browser

## Stack-Specific: Next.js + Tailwind

### Component Tests

- Use `@testing-library/react` for component tests
- Import `@testing-library/jest-dom` for DOM assertions
- Mock `next/navigation` when testing components that use routing

### API Route Tests

- Test API routes directly by importing the handler
- Use `NextRequest` from `next/server` to construct test requests

### E2E Tests

- Dev server must be running (`pnpm dev`)
- Run: `pnpm test:e2e`
- Browser helpers in `e2e/helpers/browser.ts`
