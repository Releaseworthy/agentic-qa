import { describe, expect, it } from 'bun:test';
import { judge } from '@qa/defect-detection';
import { test } from '@tests/unit/fakes';

const boundary = test({ id: 'boundary', tags: ['FEAT-CHECKOUT', 'BR-SHIP-01'], title: 'ships $50.00 free' });
const other = test({ id: 'other', tags: ['FEAT-CART', 'BR-CART-01'] });
const red = <T extends { status: string }>(t: T): T => ({ ...t, status: 'unexpected' });

describe('judge', () => {
  it('kills a defect when a test tagged with its rule goes from green to red', () => {
    const o = judge('free-shipping-boundary', [boundary, other], [red(boundary), other]);
    expect(o.verdict).toBe('killed');
    expect(o.caughtBy).toEqual(['tests/api/x.spec.ts › ships $50.00 free']);
  });

  it('does not credit a test that was already red on the clean build', () => {
    const o = judge('free-shipping-boundary', [red(boundary), other], [red(boundary), other]);
    expect(o.verdict, 'a failing test proves nothing about the defect').toBe('survived');
    expect(o.otherFailures).toBe(1);
  });

  it('does not credit a failure on another rule', () => {
    expect(judge('free-shipping-boundary', [boundary, other], [boundary, red(other)]).verdict).toBe('survived');
  });
});
