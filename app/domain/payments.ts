import { HttpError } from '@app/http';

/** Test card numbers the mock gateway declines. */
export const DECLINED_CARDS = new Set(['4000000000000002']);

export type Card = { cardNumber: string; expiry: string; cvc: string };

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * BR-PAY-01: 13-19 digits passing the Luhn check, an MM/YY expiry not in the
 * past, a 3-4 digit CVC. Returns the last four digits.
 */
export function charge(card: Card, amountCents: number, now = new Date()): string {
  const number = card.cardNumber.replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(number) || !luhn(number))
    throw new HttpError(400, 'INVALID_CARD', 'Card number is not valid');
  const m = /^(\d{2})\/(\d{2})$/.exec(card.expiry);
  const month = Number(m?.[1]);
  const year = 2000 + Number(m?.[2]);
  if (!m || month < 1 || month > 12) throw new HttpError(400, 'INVALID_CARD', 'Expiry must be MM/YY');
  const endOfMonth = new Date(year, month, 1);
  if (endOfMonth <= now) throw new HttpError(400, 'CARD_EXPIRED', 'Card has expired');
  if (!/^\d{3,4}$/.test(card.cvc)) throw new HttpError(400, 'INVALID_CARD', 'CVC must be 3 or 4 digits');
  if (amountCents <= 0) throw new HttpError(400, 'EMPTY_ORDER', 'Nothing to pay for');
  if (DECLINED_CARDS.has(number)) throw new HttpError(402, 'PAYMENT_DECLINED', 'The card was declined');
  return number.slice(-4);
}
