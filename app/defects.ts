/**
 * Seeded defects: known bugs that can be switched on to prove the test suite
 * (and the agents) catch them — a small mutation-testing harness.
 *
 *   SHOPLITE_DEFECTS=all                      every defect
 *   SHOPLITE_DEFECTS=free-shipping-boundary   a comma-separated list
 *
 * Each defect names the business rule it breaks; `qa/defect-detection.ts`
 * checks that a test tagged with that rule fails when it is on.
 */

export const DEFECTS = {
  /** BR-SHIP-01: an order of exactly $50.00 is charged shipping. */
  'free-shipping-boundary': 'BR-SHIP-01',
  /** BR-ORD-02: cancelling an order does not put its items back in stock. */
  'cancel-restock': 'BR-ORD-02',
  /** BR-CART-01: updating a cart line accepts more than 10 units. */
  'qty-limit-update': 'BR-CART-01',
  /** BR-COUP-04: a percent coupon's discount cap is ignored. */
  'coupon-cap': 'BR-COUP-04',
} as const;

export type DefectId = keyof typeof DEFECTS;

let enabled = parse(process.env.SHOPLITE_DEFECTS ?? '');

function parse(list: string): Set<string> {
  return new Set(
    list
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'none'),
  );
}

/** Switches defects at runtime (test hook `POST /api/test/defects`). Unknown ids are refused. */
export function setDefects(list: string): DefectId[] {
  const next = parse(list);
  const unknown = [...next].filter((id) => id !== 'all' && !(id in DEFECTS));
  if (unknown.length) throw new Error(`unknown defects: ${unknown.join(', ')}`);
  enabled = next;
  return enabledDefects();
}

export function defect(id: DefectId): boolean {
  return enabled.has('all') || enabled.has(id);
}

export function enabledDefects(): DefectId[] {
  return (Object.keys(DEFECTS) as DefectId[]).filter(defect);
}
