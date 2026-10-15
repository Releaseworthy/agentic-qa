/**
 * Code search from the terminal.
 *
 *   bun run codesearch "apply coupon"              hybrid search
 *   bun run codesearch --symbol CartPage.applyCoupon
 *   bun run codesearch --related app/domain/cart.ts
 *   bun run codesearch --helpers [api|pages|setup|data|fixtures]
 */

import { parseArgs } from 'node:util';
import { related } from './index';
import { findSymbol, listHelpers, search } from './search';

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    symbol: { type: 'string' },
    related: { type: 'string' },
    helpers: { type: 'boolean' },
    limit: { type: 'string' },
    json: { type: 'boolean' },
  },
});

let result: unknown;
if (values.symbol) result = findSymbol(values.symbol);
else if (values.related) result = related(values.related, 2);
else if (values.helpers) result = listHelpers(positionals[0] as Parameters<typeof listHelpers>[0]);
else if (positionals.length) result = search(positionals.join(' '), { limit: Number(values.limit ?? 8) });
else {
  console.error('usage: bun run codesearch "<query>" | --symbol <name> | --related <file> | --helpers [area]');
  process.exit(2);
}

if (values.json || !Array.isArray(result)) console.log(JSON.stringify(result, null, 2));
else
  for (const r of result as ReturnType<typeof search>) {
    console.log(`${r.score.toFixed(2).padStart(6)}  ${r.file}  [${r.via.join('+')}]`);
    for (const s of r.symbols.slice(0, 3))
      console.log(`          ↳ ${s.owner ? `${s.owner}.` : ''}${s.name}  :${s.line}`);
    for (const l of r.lines.slice(0, 2)) console.log(`          ${l.line}: ${l.text.trim().slice(0, 100)}`);
  }
