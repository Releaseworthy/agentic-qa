import { faker } from '@faker-js/faker';
import type { Address } from '@api/schemas';
import type { Registration } from '@api/auth-api';

/** A unique, valid registration (BR-AUTH-01 password). */
export function newRegistration(): Registration {
  const first = faker.person.firstName();
  return {
    name: `${first} ${faker.person.lastName()}`,
    email: `qa.${faker.string.alphanumeric(10).toLowerCase()}@example.test`,
    password: `${faker.string.alpha(6)}${faker.number.int({ min: 10, max: 99 })}`,
  };
}

export function newAddress(): Address {
  return {
    name: faker.person.fullName(),
    line1: faker.location.streetAddress(),
    city: faker.location.city(),
    postalCode: faker.location.zipCode('#####'),
    country: 'US',
  };
}

/** A SKU no other test uses. */
export function uniqueSku(): string {
  return `QA-${faker.string.alphanumeric(8).toUpperCase()}`;
}

/** A coupon code no other test uses. */
export function uniqueCouponCode(prefix = 'QA'): string {
  return `${prefix}${faker.string.alphanumeric(8).toUpperCase()}`;
}
