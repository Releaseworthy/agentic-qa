import { DateFormat, formatDate, now, shift } from '@utils/date';

export type Card = { cardNumber: string; expiry: string; cvc: string };

/** MM/YY, `months` from now. Expiries move with the calendar so the test cards don't go stale. */
function expiry(months: number): string {
  return formatDate(shift(now(), { months }), DateFormat.CARD_EXPIRY);
}

const VALID_EXPIRY = expiry(36);

/** Mock-gateway test cards (BR-PAY-01). */
export const Cards = {
  VALID: { cardNumber: '4242424242424242', expiry: VALID_EXPIRY, cvc: '123' },
  DECLINED: { cardNumber: '4000000000000002', expiry: VALID_EXPIRY, cvc: '123' },
  /** Fails the Luhn check. */
  INVALID_NUMBER: { cardNumber: '4242424242424241', expiry: VALID_EXPIRY, cvc: '123' },
  /** Expired at the end of last month. */
  EXPIRED: { cardNumber: '4242424242424242', expiry: expiry(-1), cvc: '123' },
} as const satisfies Record<string, Card>;
