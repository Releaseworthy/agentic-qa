/** Where the system under test runs, and the admin account the data-setup helpers act as. */
export const config = {
  baseUrl: process.env.BASE_URL ?? 'http://localhost:3100',
  admin: {
    email: process.env.SHOPLITE_ADMIN_EMAIL ?? 'admin@shoplite.test',
    password: process.env.SHOPLITE_ADMIN_PASSWORD ?? 'admin-demo-pass1',
  },
} as const;

/** Every timeout in one place (ms). */
export const Timeout = {
  TEST: 30_000,
  EXPECT: 5_000,
  ACTION: 10_000,
  SERVER_START: 30_000,
} as const;
