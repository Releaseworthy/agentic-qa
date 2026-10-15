import { config } from './config';

/**
 * Pins the app's seeded defects to exactly SHOPLITE_DEFECTS (default: none), so a
 * reused local server left in a defect mode by an exploratory session can't
 * change this run's results.
 */
export default async function globalSetup(): Promise<void> {
  const res = await fetch(`${config.baseUrl}/api/test/defects`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: process.env.SHOPLITE_DEFECTS || 'none' }),
  });
  // 404: a deployed build without test hooks — it has no seeded defects to pin.
  if (!res.ok && res.status !== 404) throw new Error(`could not set seeded defects: ${res.status} ${await res.text()}`);
}
