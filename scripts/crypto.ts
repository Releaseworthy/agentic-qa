#!/usr/bin/env bun
/**
 * CLI for framework/utils/crypto.ts.
 *
 *   bun run crypto keygen
 *   'secret' | bun run crypto encrypt
 *   'enc1....' | bun run crypto decrypt
 *
 * Input comes from stdin or an argument; prefer stdin, which stays out of
 * shell history. The key is $STRING_HEX_SHOPLITE.
 */

import { decrypt, encrypt, generateKey, KEY_ENV_VAR } from '@utils/crypto';

const USAGE = `Usage:
  bun run crypto keygen
  bun run crypto encrypt [<plaintext>]    (or pipe the plaintext in)
  bun run crypto decrypt [<token>]        (or pipe the token in)

The key is read from $${KEY_ENV_VAR}.
`;

async function readInput(args: string[]): Promise<string> {
  if (args.length > 0) return args.join(' ');
  if (process.stdin.isTTY) throw new Error('nothing to read: pass an argument or pipe input in');
  return (await Bun.stdin.text()).replace(/\r?\n$/, '');
}

async function main([command, ...args]: string[]): Promise<number> {
  switch (command) {
    case 'keygen':
      process.stdout.write(`${generateKey()}\n`);
      return 0;
    case 'encrypt':
      process.stdout.write(`${encrypt(await readInput(args))}\n`);
      return 0;
    case 'decrypt':
      process.stdout.write(`${decrypt(await readInput(args))}\n`);
      return 0;
    default:
      process.stderr.write(USAGE);
      return command === undefined || command === 'help' ? 0 : 1;
  }
}

// Awaited at top level: with a .then() chain Bun can exit before stdin resolves.
try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error: unknown) {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
