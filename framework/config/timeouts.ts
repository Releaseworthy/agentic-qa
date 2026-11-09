/**
 * Every Playwright timeout in this repo comes from this ladder (owner rule
 * RULE-TIMEOUTS-FROM-A-TIMEOUT-ENUM-LIKE-OMNIA-DEFAULT-UNLESS-NO-SIGNAL).
 */
export const Timeout = {
  IMMEDIATE: 0,
  EXTREME_SHORT: 50,
  VERY_SHORT: 1_000,
  SHORT: 5_000,
  DEFAULT: 15_000,
  LONG: 60_000,
  VERY_LONG: 120_000,
  MAX: 240_000,
  // Repo aliases
  TEST: 30_000,
  EXPECT: 15_000,
  ACTION: 15_000,
  SERVER_START: 30_000,
} as const;

export type Timeout = (typeof Timeout)[keyof typeof Timeout];

