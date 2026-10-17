/**
 * Arranges a precondition from a framework recipe (framework/setup/recipes.ts) for a manual run, a bug repro or
 * exploration, and saves the browser state `playwright-cli state-load` restores. Starts ShopLite as TEST_ENV when it
 * is not running (in the background; `SHOPLITE_DEFECTS` passes through).
 *
 *   bun run qa:arrange cart --name s1 priceCents=5000 quantity=1
 *   bun run qa:arrange --case TC-CHK-002 --name s1          the test case's `setup`
 *   bun run qa:arrange returning-customer --name s1         creates nothing; works on live
 *   bun run qa:arrange --list [--json]                      the recipes and their params
 *   bun run qa:arrange --catalog [--check]                  (re)write / verify knowledge/setup/SETUP-RECIPES.md
 *   bun run qa:arrange --check                              catalog up to date, every test case arranges via a recipe
 *   bun run qa:arrange --stop                               stop the ShopLite this CLI started for TEST_ENV
 *
 *   --defects <ids|all|none>   switch the app's seeded defects (app/defects.ts) — practice targets
 *
 * Prints JSON: user (with password), data (what was created), testData (cards, address, registration), next
 * (the playwright-cli commands that open the state). Saves out/sessions/<name>.json and <name>.arranged.json.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { YAML } from 'bun';
import { request } from '@playwright/test';
import { z } from 'zod';
import { storageState } from '@auth/session';
import { env } from '@config/env';
import { ROOT } from '@config/paths';
import { Vault } from '@qa/vault';
import { CATALOG_PATH, checkCases, renderCatalog } from '@setup/catalog';
import { RECIPES, arrange, isRecipe, testData, type RecipeId } from '@setup/recipes';
import { toMs } from '@utils/date';

/** ShopLite's /health answer, or undefined when nothing answers. */
async function health(): Promise<{ env?: unknown } | undefined> {
  try {
    const res = await fetch(`${env.baseUrl}/health`);
    return res.ok ? ((await res.json()) as { env?: unknown }) : undefined;
  } catch {
    return undefined;
  }
}

/** The app must answer as TEST_ENV — the check global setup makes — so a recipe never seeds another environment. */
function assertEnvironment(answer: { env?: unknown }): void {
  if (answer.env !== env.name)
    throw new Error(`${env.baseUrl} answers as the "${String(answer.env)}" environment, not TEST_ENV=${env.name}`);
}

/** The background ShopLite this CLI started for TEST_ENV, so `--stop` can end it. */
const PID_FILE = join(ROOT, 'out', 'sessions', `.app-${env.name}.pid`);

async function ensureServer(): Promise<boolean> {
  const running = await health();
  if (running) {
    assertEnvironment(running);
    return false;
  }
  if (!env.startApp)
    throw new Error(`${env.baseUrl} is not answering, and TEST_ENV=${env.name} does not start the app`);
  const child = spawn(process.execPath, ['run', 'framework/setup/app-server.ts'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  mkdirSync(dirname(PID_FILE), { recursive: true });
  writeFileSync(PID_FILE, String(child.pid));
  let started = await health();
  for (let i = 0; i < 50 && !started; i++) {
    await Bun.sleep(toMs({ seconds: 0.2 }));
    started = await health();
  }
  if (!started) throw new Error(`ShopLite did not start at ${env.baseUrl}`);
  assertEnvironment(started);
  return true;
}

/** `priceCents=5000 applied=true coupon=WELCOME10` → typed values (YAML scalars). */
function paramsOf(pairs: string[]): Record<string, unknown> {
  return Object.fromEntries(
    pairs.map((pair) => {
      const at = pair.indexOf('=');
      if (at < 1) throw new Error(`"${pair}" is not param=value`);
      const raw = pair.slice(at + 1);
      let value: unknown = raw;
      try {
        value = YAML.parse(raw);
      } catch {
        // not a YAML scalar: keep the string
      }
      return [pair.slice(0, at), value];
    }),
  );
}

function check(): number {
  const problems: string[] = [];
  const catalog = join(ROOT, CATALOG_PATH);
  if (!existsSync(catalog) || readFileSync(catalog, 'utf8') !== renderCatalog())
    problems.push(`${CATALOG_PATH} is out of date — bun run qa:arrange --catalog`);
  const vault = new Vault();
  problems.push(...checkCases(vault.testCases, (tc) => readFileSync(join(ROOT, tc.path), 'utf8')));
  for (const p of problems) console.error(`✗ ${p}`);
  if (!problems.length)
    console.log(`✓ recipe catalog current · ${vault.testCases.length} test cases arrange via recipes`);
  return problems.length ? 1 : 0;
}

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    name: { type: 'string', default: 'explore' },
    case: { type: 'string' },
    defects: { type: 'string' },
    list: { type: 'boolean' },
    json: { type: 'boolean' },
    catalog: { type: 'boolean' },
    check: { type: 'boolean' },
    stop: { type: 'boolean' },
  },
});

// A session name becomes file names under out/sessions/ and a playwright-cli session.
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(values.name))
  throw new Error(`--name "${values.name}": lower-case letters, digits and dashes (explorer-coupon)`);

if (values.stop) {
  if (!existsSync(PID_FILE)) {
    console.log(`no background ShopLite started by qa:arrange for TEST_ENV=${env.name}`);
    process.exit(0);
  }
  const pid = Number(readFileSync(PID_FILE, 'utf8'));
  try {
    process.kill(pid);
    console.log(`stopped ShopLite (${env.name}, pid ${pid})`);
  } catch {
    console.log(`ShopLite (${env.name}, pid ${pid}) was not running`);
  }
  rmSync(PID_FILE);
  process.exit(0);
}

if (values.check && !values.catalog) process.exit(check());
if (values.catalog) {
  const path = join(ROOT, CATALOG_PATH);
  if (values.check) {
    const current = existsSync(path) && readFileSync(path, 'utf8') === renderCatalog();
    console.log(current ? `✓ ${CATALOG_PATH} is current` : `✗ ${CATALOG_PATH} is out of date`);
    process.exit(current ? 0 : 1);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderCatalog());
  console.log(`wrote ${CATALOG_PATH} — run \`bun run rag:build\` to index it`);
  process.exit(0);
}
if (values.list) {
  const rows = Object.entries(RECIPES).map(([id, r]) => ({
    id,
    summary: r.summary,
    seeds: r.seeds,
    lands: r.lands,
    params: Object.keys(r.params.shape),
    example: r.example,
  }));
  if (values.json) console.log(JSON.stringify(rows, null, 2));
  else
    for (const r of rows)
      console.log(
        `${r.id.padEnd(20)} ${r.seeds ? '' : '[no data] '}${r.summary}\n${' '.repeat(21)}params: ${r.params.join(', ') || '—'}`,
      );
  process.exit(0);
}

let id: string;
let params: Record<string, unknown>;
if (values.case !== undefined) {
  const tc = new Vault().testCases.find((c) => c.id === values.case);
  if (!tc) throw new Error(`--case: no test case ${values.case}`);
  if (!tc.setup) throw new Error(`${tc.id} has no \`setup\` — qa-writer adds the recipe that arranges it`);
  ({ recipe: id, params } = tc.setup);
  params = { ...params, ...paramsOf(positionals) };
} else {
  const [first, ...rest] = positionals;
  if (first === undefined) throw new Error('name a recipe (bun run qa:arrange --list) or --case TC-…');
  id = first;
  params = paramsOf(rest);
}
if (!isRecipe(id)) throw new Error(`unknown recipe "${id}" — one of ${Object.keys(RECIPES).join(', ')}`);
const recipeId: RecipeId = id;
const valid = RECIPES[recipeId].params.safeParse(params);
if (!valid.success) {
  console.error(`recipe "${recipeId}": ${z.prettifyError(valid.error)}\n(bun run qa:arrange --list shows its params)`);
  process.exit(1);
}
if (RECIPES[recipeId].seeds && env.readOnly)
  throw new Error(
    `TEST_ENV=${env.name} is read-only: recipe "${recipeId}" creates data — use guest or returning-customer`,
  );

const started = await ensureServer();
if (values.defects !== undefined) {
  const res = await fetch(`${env.baseUrl}/api/test/defects`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: values.defects || 'none' }),
  });
  if (!res.ok) throw new Error(`could not set defects: ${await res.text()}`);
}

const ctx = await request.newContext({ baseURL: env.baseUrl });
try {
  const arranged = await arrange(ctx, recipeId, params as never);
  const dir = join(ROOT, 'out', 'sessions');
  mkdirSync(dir, { recursive: true });
  const stateFile = `out/sessions/${values.name}.json`;
  writeFileSync(join(ROOT, stateFile), JSON.stringify(storageState(arranged.signedIn), null, 2));
  const s = `-s=${values.name}`;
  const out = {
    recipe: recipeId,
    params,
    case: values.case,
    env: env.name,
    app: env.baseUrl,
    startedApp: started,
    signedIn: arranged.signedIn !== undefined,
    stateFile,
    user: arranged.user && { ...arranged.user, token: undefined },
    data: arranged.data,
    testData: testData(),
    next: [
      `bunx playwright-cli ${s} open ${env.baseUrl}`,
      ...(arranged.signedIn ? [`bunx playwright-cli ${s} state-load ${stateFile}`] : []),
      `bunx playwright-cli ${s} goto ${env.baseUrl}/${arranged.route}`,
    ],
  };
  writeFileSync(join(dir, `${values.name}.arranged.json`), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
} finally {
  await ctx.dispose();
}
