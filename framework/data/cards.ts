export type Card = { cardNumber: string; expiry: string; cvc: string };

/** Mock-gateway test cards (BR-PAY-01). */
export const Cards = {
  VALID: { cardNumber: '4242424242424242', expiry: '12/34', cvc: '123' },
  DECLINED: { cardNumber: '4000000000000002', expiry: '12/34', cvc: '123' },
  /** Fails the Luhn check. */
  INVALID_NUMBER: { cardNumber: '4242424242424241', expiry: '12/34', cvc: '123' },
  EXPIRED: { cardNumber: '4242424242424242', expiry: '01/20', cvc: '123' },
} as const satisfies Record<string, Card>;
