import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root, independent of the working directory. */
export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** env/.env.<TEST_ENV> files (committed; secrets in them are enc1.… tokens). */
export const ENV_DIR = join(ROOT, 'env');

/** Saved storage states: .auth/<env>/<account>.json (gitignored). */
export const AUTH_DIR = join(ROOT, '.auth');
