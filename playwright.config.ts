// E7 · E2E (PROMPT_MAESTRO_FASE1.md §12.1: registro, login, invitación
// completa, switch de copropiedad). Corre contra el Supabase remoto real
// (mismo .env que Vitest) — sin mocks, sin Supabase local (D-08).
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  // Cada test levanta una instancia de Chromium contra una app Nuxt SSR
  // completa — varios workers en paralelo agotan la memoria en una máquina
  // de recursos modestos (visto: "Fatal process out of memory" real).
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm --filter @aquila/web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
