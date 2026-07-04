import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    // Bind IPv4 loopback explicitly: on hosts where `localhost` resolves
    // to ::1 first (e.g. GitHub runners), vite would otherwise bind IPv6
    // only and the 127.0.0.1 readiness probe would never connect.
    command: 'vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
