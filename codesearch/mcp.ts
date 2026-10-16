/**
 * The `codesearch` MCP server (stdio): hybrid code search for agents, so they
 * find the existing helpers, fixtures and page objects before writing new ones.
 *
 *   bun run codesearch/mcp.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { codeIndex, related } from '@codesearch/index';
import { findSymbol, grep, listHelpers, search } from '@codesearch/search';

const server = new McpServer(
  { name: 'codesearch', version: '1.0.0' },
  {
    instructions:
      'Search this repository: search_code (hybrid ripgrep + import graph, ranked files with lines and symbols), ' +
      'grep (raw ripgrep), find_symbol (definitions + usages), related_files (imports / importers), ' +
      'list_helpers (API helpers, seed and precondition recipes, page objects, fixtures — reuse these before writing new code).',
  },
);

const text = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }] });

server.registerTool(
  'search_code',
  {
    description:
      'Hybrid search: ripgrep text hits ranked by term rarity, boosted by matching symbol names and by the import graph. ' +
      'Use natural words ("apply coupon cart") or identifiers.',
    inputSchema: {
      query: z.string(),
      limit: z.number().int().min(1).max(30).optional(),
      near: z.string().optional().describe('repo-relative file to rank results around'),
      glob: z.string().optional().describe('restrict to files matching, e.g. "framework/**"'),
    },
  },
  ({ query, limit, near, glob }) => text(search(query, { limit, near, glob })),
);

server.registerTool(
  'grep',
  {
    description: 'Raw ripgrep over app/, framework/, tests/, qa/, codesearch/, agents/.',
    inputSchema: { pattern: z.string(), regex: z.boolean().optional(), glob: z.string().optional() },
  },
  ({ pattern, regex, glob }) => text(grep(pattern, { regex, glob }).slice(0, 100)),
);

server.registerTool(
  'find_symbol',
  {
    description:
      'Where a function, class, type or method is defined, and its usages. "CartPage.applyCoupon" works too.',
    inputSchema: { name: z.string() },
  },
  ({ name }) => text(findSymbol(name)),
);

server.registerTool(
  'related_files',
  {
    description: 'What a file imports and what imports it, up to `depth` hops.',
    inputSchema: { file: z.string(), depth: z.number().int().min(1).max(4).optional() },
  },
  ({ file, depth }) => {
    const index = codeIndex();
    if (!index.files.has(file)) throw new Error(`not indexed: ${file}`);
    return text(related(file, depth ?? 1, index));
  },
);

server.registerTool(
  'list_helpers',
  {
    description:
      'Reusable framework building blocks with signatures: api helpers, seed (test data), recipes (named preconditions), page objects, fixtures.',
    inputSchema: { area: z.enum(['api', 'pages', 'setup', 'data', 'fixtures']).optional() },
  },
  ({ area }) => text(listHelpers(area)),
);

await server.connect(new StdioServerTransport());
