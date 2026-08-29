---
name: "playwright-testing"
description: "Designs and implements Playwright E2E tests — page objects, fixtures, assertions, visual regression, and CI integration."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# playwright-testing

Design, implement, and review Playwright end-to-end tests for production web applications. Covers project setup, page object model, fixtures with test isolation, resilient selectors, auto-retrying assertions, visual regression with screenshots, API mocking, and CI integration with GitHub Actions.

## When to use

- User wants to set up Playwright for a new project
- User needs page object model for maintainable E2E tests
- User asks about resilient selectors (role, text, data-testid)
- User wants visual regression testing with screenshot comparison
- User needs to mock APIs or intercept network requests in tests
- User asks about CI integration for E2E tests (GitHub Actions, Docker)
- User wants to fix flaky tests or improve test reliability
- User asks for a review of existing Playwright test code

## When NOT to use

- User needs unit or component tests (use Vitest or Testing Library)
- User wants API testing only (use Supertest or Playwright API testing separately)
- User asks about Cypress, Selenium, or Puppeteer specifically
- User needs load testing or performance benchmarks (use k6 or Artillery)
- User wants mobile app testing (Playwright supports web only)

## Procedure

### Step 1: Project setup (playwright.config.ts)

Configure Playwright with sensible defaults for local development and CI.

**Install Playwright:**

```bash
npm init playwright@latest
# Or add to existing project:
npm install -D @playwright/test
npx playwright install --with-deps chromium firefox webkit
```

**Configuration file:**

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  // Parallel execution
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined, // Limit workers in CI

  // Retry flaky tests in CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github'], ['json', { outputFile: 'test-results.json' }]]
    : [['html', { open: 'on-failure' }]],

  // Global settings
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',          // Capture trace on retry
    screenshot: 'only-on-failure',      // Screenshot on failure
    video: 'on-first-retry',           // Record video on retry
    actionTimeout: 10_000,             // 10s per action
    navigationTimeout: 30_000,         // 30s for navigation
  },

  // Browser projects
  projects: [
    // Setup project (auth, seed data)
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },

    // Mobile viewports
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 14'] },
      dependencies: ['setup'],
    },
  ],

  // Start dev server before tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

### Step 2: Page object model

Encapsulate page interactions in reusable classes. Each page object owns its selectors and actions.

**Base page object:**

```typescript
// e2e/pages/base.page.ts
import { type Page, type Locator, expect } from '@playwright/test';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  abstract readonly url: string;

  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForReady();
  }

  async waitForReady(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async getToastMessage(): Promise<string> {
    const toast = this.page.getByRole('alert');
    await expect(toast).toBeVisible();
    return toast.textContent() as Promise<string>;
  }
}
```

**Login page object:**

```typescript
// e2e/pages/login.page.ts
import { type Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class LoginPage extends BasePage {
  readonly url = '/login';

  // Locators -- use roles and test IDs, never XPath
  readonly emailInput = this.page.getByLabel('Email');
  readonly passwordInput = this.page.getByLabel('Password');
  readonly submitButton = this.page.getByRole('button', { name: 'Sign in' });
  readonly errorMessage = this.page.getByRole('alert');
  readonly forgotPasswordLink = this.page.getByRole('link', { name: 'Forgot password?' });

  constructor(page: Page) {
    super(page);
  }

  async login(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async expectError(message: string): Promise<void> {
    await expect(this.errorMessage).toContainText(message);
  }

  async expectRedirectToDashboard(): Promise<void> {
    await expect(this.page).toHaveURL(/\/dashboard/);
  }
}
```

**Dashboard page object:**

```typescript
// e2e/pages/dashboard.page.ts
import { type Page, expect } from '@playwright/test';
import { BasePage } from './base.page';

export class DashboardPage extends BasePage {
  readonly url = '/dashboard';

  readonly heading = this.page.getByRole('heading', { name: 'Dashboard' });
  readonly userMenu = this.page.getByTestId('user-menu');
  readonly logoutButton = this.page.getByRole('menuitem', { name: 'Log out' });
  readonly projectList = this.page.getByTestId('project-list');
  readonly createProjectButton = this.page.getByRole('button', { name: 'New project' });

  constructor(page: Page) {
    super(page);
  }

  async expectLoaded(): Promise<void> {
    await expect(this.heading).toBeVisible();
  }

  async getProjectCount(): Promise<number> {
    const items = this.projectList.getByRole('listitem');
    return items.count();
  }

  async logout(): Promise<void> {
    await this.userMenu.click();
    await this.logoutButton.click();
    await expect(this.page).toHaveURL(/\/login/);
  }

  async createProject(name: string): Promise<void> {
    await this.createProjectButton.click();
    await this.page.getByLabel('Project name').fill(name);
    await this.page.getByRole('button', { name: 'Create' }).click();
  }
}
```

### Step 3: Fixtures and test isolation

Create custom fixtures that provide page objects and handle setup/teardown.

**Custom fixtures:**

```typescript
// e2e/fixtures.ts
import { test as base, expect } from '@playwright/test';
import { LoginPage } from './pages/login.page';
import { DashboardPage } from './pages/dashboard.page';

// Declare fixture types
type Fixtures = {
  loginPage: LoginPage;
  dashboardPage: DashboardPage;
  authenticatedPage: DashboardPage;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  dashboardPage: async ({ page }, use) => {
    const dashboardPage = new DashboardPage(page);
    await use(dashboardPage);
  },

  // Fixture that provides an already-authenticated page
  authenticatedPage: async ({ page, context }, use) => {
    // Load saved auth state
    const storageState = JSON.parse(
      require('fs').readFileSync('e2e/.auth/user.json', 'utf-8')
    );
    await context.addCookies(storageState.cookies);

    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.expectLoaded();
    await use(dashboard);
  },
});

export { expect };
```

**Authentication setup (runs once before all tests):**

```typescript
// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';

const authFile = 'e2e/.auth/user.json';

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('testuser@example.com');
  await page.getByLabel('Password').fill(process.env.TEST_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for redirect after login
  await expect(page).toHaveURL(/\/dashboard/);

  // Save auth state
  await page.context().storageState({ path: authFile });
});
```

**Database isolation per test:**

```typescript
// e2e/fixtures.ts (extended)
export const test = base.extend<Fixtures & { seedData: SeedData }>({
  // Seed unique test data for each test
  seedData: async ({}, use) => {
    const testId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Create isolated test data via API
    const response = await fetch(`${process.env.API_URL}/test/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Key': process.env.TEST_API_KEY! },
      body: JSON.stringify({ testId }),
    });
    const data = await response.json();

    await use(data);

    // Cleanup after test
    await fetch(`${process.env.API_URL}/test/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Test-Key': process.env.TEST_API_KEY! },
      body: JSON.stringify({ testId }),
    });
  },
});
```

### Step 4: Selectors (role, text, data-testid)

Use resilient selectors that survive UI refactors. The priority order matters.

**Selector priority (best to worst):**

| Priority | Selector type | Example | When to use |
|---|---|---|---|
| 1 | Role + name | `getByRole('button', { name: 'Submit' })` | Interactive elements with visible text |
| 2 | Label | `getByLabel('Email')` | Form inputs with associated labels |
| 3 | Placeholder | `getByPlaceholder('Search...')` | Inputs with placeholder (when no label exists) |
| 4 | Text | `getByText('Welcome back')` | Static text content |
| 5 | Test ID | `getByTestId('user-avatar')` | Elements with no semantic selector |
| 6 | CSS | `page.locator('.card:nth-child(2)')` | Last resort only |
| Never | XPath | `page.locator('//div[@class="card"]')` | Never use in Playwright tests |

**Real examples:**

```typescript
// GOOD -- role-based selectors
await page.getByRole('button', { name: 'Save changes' }).click();
await page.getByRole('link', { name: 'Settings' }).click();
await page.getByRole('heading', { level: 1 }).toContainText('Dashboard');
await page.getByRole('tab', { name: 'Billing' }).click();
await page.getByRole('checkbox', { name: 'I agree to the terms' }).check();
await page.getByRole('combobox', { name: 'Country' }).selectOption('US');

// GOOD -- label selectors for forms
await page.getByLabel('Email address').fill('user@example.com');
await page.getByLabel('Password').fill('secret123');

// GOOD -- test ID for elements without semantic roles
await page.getByTestId('notification-badge').toHaveText('3');
await page.getByTestId('sidebar').getByRole('link', { name: 'Users' }).click();

// BAD -- fragile selectors
await page.locator('#btn-submit').click();           // ID can change
await page.locator('.btn.btn-primary').click();       // Class names change
await page.locator('div > form > button').click();    // DOM structure changes
await page.locator('//button[@type="submit"]').click(); // XPath -- never use
```

### Step 5: Assertions (expect with auto-retry)

Use Playwright's built-in auto-retrying assertions. They poll until the condition is met or timeout expires.

**Auto-retrying web assertions:**

```typescript
import { expect } from '@playwright/test';

// Visibility
await expect(page.getByRole('alert')).toBeVisible();
await expect(page.getByTestId('loading')).toBeHidden();

// Text content
await expect(page.getByRole('heading')).toHaveText('Dashboard');
await expect(page.getByTestId('status')).toContainText('Active');

// Input values
await expect(page.getByLabel('Email')).toHaveValue('user@example.com');
await expect(page.getByLabel('Name')).not.toBeEmpty();

// Element state
await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled();
await expect(page.getByRole('checkbox')).toBeChecked();

// URL and title
await expect(page).toHaveURL('/dashboard');
await expect(page).toHaveURL(/\/users\/\d+/);
await expect(page).toHaveTitle(/Dashboard/);

// Count
await expect(page.getByRole('listitem')).toHaveCount(5);

// CSS classes and attributes
await expect(page.getByTestId('card')).toHaveClass(/active/);
await expect(page.getByRole('link')).toHaveAttribute('href', '/settings');

// Custom timeout for slow operations
await expect(page.getByText('Report generated')).toBeVisible({ timeout: 30_000 });
```

**Soft assertions (continue test on failure):**

```typescript
test('dashboard shows all widgets', async ({ page }) => {
  await page.goto('/dashboard');

  // Soft assertions -- collect all failures, don't stop
  await expect.soft(page.getByTestId('revenue-widget')).toBeVisible();
  await expect.soft(page.getByTestId('users-widget')).toBeVisible();
  await expect.soft(page.getByTestId('orders-widget')).toBeVisible();
  await expect.soft(page.getByTestId('chart-widget')).toBeVisible();
});
```

### Step 6: Visual regression (screenshots)

Compare screenshots to catch unintended visual changes.

**Full page screenshot comparison:**

```typescript
test('landing page visual', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Full page screenshot
  await expect(page).toHaveScreenshot('landing-page.png', {
    fullPage: true,
    maxDiffPixelRatio: 0.01,  // Allow 1% pixel difference
  });
});
```

**Component-level screenshots:**

```typescript
test('navigation menu visual', async ({ page }) => {
  await page.goto('/dashboard');

  const nav = page.getByRole('navigation');
  await expect(nav).toHaveScreenshot('navigation.png', {
    maxDiffPixelRatio: 0.01,
  });
});

test('user card visual', async ({ page }) => {
  await page.goto('/users/1');

  const card = page.getByTestId('user-card');
  await expect(card).toHaveScreenshot('user-card.png', {
    animations: 'disabled',  // Freeze CSS animations
    mask: [page.getByTestId('user-avatar')],  // Mask dynamic content
  });
});
```

**Managing screenshots:**

```bash
# Update baseline screenshots
npx playwright test --update-snapshots

# Run visual tests only
npx playwright test --grep @visual

# Compare with specific threshold
npx playwright test --config=playwright.visual.config.ts
```

**Handling dynamic content:**

```typescript
test('dashboard with masked dynamic areas', async ({ page }) => {
  await page.goto('/dashboard');

  // Mask areas with dynamic content
  await expect(page).toHaveScreenshot('dashboard.png', {
    mask: [
      page.getByTestId('current-time'),
      page.getByTestId('live-chart'),
      page.getByTestId('notification-count'),
    ],
    animations: 'disabled',
    caret: 'hide',  // Hide blinking cursor
  });
});
```

### Step 7: API mocking (route.fulfill)

Intercept and mock network requests for deterministic tests.

**Mock API response:**

```typescript
test('displays user list from API', async ({ page }) => {
  // Intercept the API call
  await page.route('**/api/users*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        users: [
          { id: '1', name: 'Alice', email: 'alice@example.com' },
          { id: '2', name: 'Bob', email: 'bob@example.com' },
        ],
        total: 2,
      }),
    });
  });

  await page.goto('/users');
  await expect(page.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByText('Alice')).toBeVisible();
});
```

**Simulate error states:**

```typescript
test('shows error message on API failure', async ({ page }) => {
  await page.route('**/api/users*', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal server error' }),
    });
  });

  await page.goto('/users');
  await expect(page.getByRole('alert')).toContainText('Something went wrong');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
```

**Simulate slow network:**

```typescript
test('shows loading state during slow API', async ({ page }) => {
  await page.route('**/api/dashboard*', async (route) => {
    // Delay response by 3 seconds
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ widgets: [] }),
    });
  });

  await page.goto('/dashboard');
  await expect(page.getByTestId('loading-skeleton')).toBeVisible();
  await expect(page.getByTestId('loading-skeleton')).toBeHidden({ timeout: 5000 });
});
```

**Modify real responses (partial mock):**

```typescript
test('displays modified data', async ({ page }) => {
  await page.route('**/api/user/me', async (route) => {
    // Fetch real response
    const response = await route.fetch();
    const json = await response.json();

    // Modify it
    json.name = 'Test User';
    json.subscription = 'premium';

    await route.fulfill({ response, json });
  });

  await page.goto('/profile');
  await expect(page.getByText('Test User')).toBeVisible();
  await expect(page.getByText('Premium')).toBeVisible();
});
```

### Step 8: CI integration (GitHub Actions, Docker)

Run Playwright tests reliably in CI with proper caching and artifact handling.

**GitHub Actions workflow:**

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: testdb
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Build application
        run: npm run build
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb

      - name: Run database migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb

      - name: Run E2E tests
        run: npx playwright test --project=chromium
        env:
          BASE_URL: http://localhost:3000
          DATABASE_URL: postgresql://test:test@localhost:5432/testdb

      - name: Upload test report
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14

      - name: Upload test results
        if: ${{ !cancelled() }}
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/
          retention-days: 7
```

**Docker setup for consistent environments:**

```dockerfile
# e2e/Dockerfile
FROM mcr.microsoft.com/playwright:v1.48.0-noble

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

CMD ["npx", "playwright", "test"]
```

```yaml
# docker-compose.e2e.yml
services:
  e2e:
    build:
      context: .
      dockerfile: e2e/Dockerfile
    depends_on:
      app:
        condition: service_healthy
    environment:
      BASE_URL: http://app:3000
    volumes:
      - ./playwright-report:/app/playwright-report
      - ./test-results:/app/test-results

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://test:test@db:5432/testdb
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 5s
      timeout: 3s
      retries: 10

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: testdb
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 5s
      timeout: 3s
      retries: 5
```

**Run E2E in Docker:**

```bash
docker compose -f docker-compose.e2e.yml up --build --exit-code-from e2e
```

## Anti-patterns

| Anti-pattern | Why it is wrong | Fix |
|---|---|---|
| Flaky XPath selectors | Break on any DOM change; fragile by nature | Use `getByRole`, `getByLabel`, `getByTestId` |
| No page objects | Selectors duplicated across tests; maintenance nightmare | Create page object classes for each page |
| Hardcoded `waitForTimeout(5000)` | Wastes time or still flaky; race condition | Use auto-retrying `expect()` assertions |
| No test isolation | Tests depend on each other's state; order matters | Each test seeds its own data; use fixtures |
| Tests share browser state | Login state leaks; parallel execution fails | Use `storageState` files; isolate contexts |
| No CI integration | E2E tests only run locally; bugs ship to production | Add GitHub Actions workflow with artifact upload |
| Screenshots without masking | Dynamic content (timestamps, avatars) causes false failures | Mask dynamic areas; disable animations |
| Testing implementation details | Tests break on refactor even if behavior is unchanged | Test user-visible behavior, not internal structure |
| No error state tests | Happy path works but error handling is untested | Mock API failures; test error messages and retry flows |
| Running all browsers in CI | Triples CI time; most bugs appear in one browser | Run Chromium in CI; full browser matrix on nightly |

## Self-check

Before completing, verify all 10 items:

1. `playwright.config.ts` is configured with timeouts, retries, and reporter
2. Page objects encapsulate all selectors and page-specific actions
3. Custom fixtures provide page objects and handle setup/teardown
4. Selectors use role, label, or test ID (never XPath, rarely CSS)
5. All assertions use auto-retrying `expect()` (no `waitForTimeout`)
6. Visual regression tests mask dynamic content and disable animations
7. API mocking covers both success and error scenarios
8. CI workflow uploads artifacts (report, screenshots, traces) on failure
9. Tests are isolated (each test can run independently in any order)
10. `webServer` is configured for automatic dev server startup
