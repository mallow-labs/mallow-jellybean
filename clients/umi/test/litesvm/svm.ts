import { existsSync } from 'fs';
import { dirname, join } from 'path';
// Use the native NAPI binding directly. The public `litesvm` entrypoint pulls in
// `@solana/kit` (v2) types/runtime; the native binding speaks plain Uint8Array,
// which bridges cleanly to the web3.js v1 world these umi tests live in.
import { PublicKey } from '@solana/web3.js';
import { LiteSvm } from 'litesvm/dist/internal';

/**
 * Programs loaded into the LiteSVM instance.
 *
 *  - `mallow_jellybean.so` is produced by `anchor build` (repo `target/deploy`).
 *  - `mpl_core.so` / `gumball_guard.so` are mainnet dumps vendored under
 *    `clients/umi/test/programs` (see `test/programs/dump.sh`).
 *
 * SPL Token, Token-2022 and the associated-token program are built into the
 * LiteSVM standard runtime, so they don't need to be loaded here.
 *
 * NOTE: `mpl_core.so` must be a CURRENT mainnet dump — an older cached copy
 * predates the `CreateV2` instruction and fails fixture creation with a
 * BorshIoError. Re-run `dump.sh` if mpl-core execution fails to deserialize.
 */
const PROGRAMS: { id: string; file: string }[] = [
  {
    id: 'J3LLYcm8V5hJRzCKENRPW3yGdQ6xU8Nie8jr3mU88eqq',
    file: 'target/deploy/mallow_jellybean.so',
  },
  {
    id: 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d',
    file: 'clients/umi/test/programs/mpl_core.so',
  },
  {
    id: 'GGRDy4ieS7ExrUu313QkszyuT9o3BvDLuc3H5VLgCpSF',
    file: 'clients/umi/test/programs/gumball_guard.so',
  },
  // MPL System Extras — mpl-toolbox's `createMint` funds the mint via
  // `createAccountWithRent`, which CPIs this program to compute rent on-chain.
  {
    id: 'SysExL2WDyJi9aRZrXorrjHJut3JwHQ7R9bTyctbNNG',
    file: 'clients/umi/test/programs/mpl_system_extras.so',
  },
];

/**
 * Resolve a repo-relative artifact by walking up ancestor directories until one
 * contains it. Works both when tests run from the compiled `dist/test` tree and
 * from a normal ts-node run, regardless of how deep the caller sits.
 */
function resolveArtifact(relPath: string): string | null {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, relPath);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let svm: LiteSvm | null = null;

/**
 * Lazily create (once per process) a LiteSVM instance with all mallow + metaplex
 * programs loaded. AVA runs each test *file* in its own worker process, so this
 * per-process singleton is naturally isolated per file — no cross-file bleed.
 */
export function getSvm(): LiteSvm {
  if (svm) return svm;

  const instance = new LiteSvm();
  // Load the standard SPL programs (Token, Token-2022, Associated Token, Memo).
  // The raw native constructor omits the Associated Token program, which the
  // token-payment fixtures need for `createAssociatedToken` — without it those
  // transactions fail with InvalidProgramForExecution.
  instance.setDefaultPrograms();
  // Disable duplicate-signature history. LiteSVM keeps a single valid blockhash
  // and its ledger is shared across the tests in a file (which AVA runs
  // concurrently, and some drive concurrent sends via `Promise.all`), so we can't
  // rotate the blockhash to make a logically-identical resend unique. On a real
  // validator such a resend would carry a fresh blockhash and thus a distinct
  // signature; with history off, LiteSVM likewise re-executes it and surfaces the
  // program-level error (e.g. InvalidState, AccountNotInitialized) the negative
  // tests assert, instead of rejecting it as AlreadyProcessed. Sigverify and the
  // blockhash check both stay enabled.
  instance.setTransactionHistory(0n);
  // Seed the SPL Token / Token-2022 native mint accounts (wSOL).
  instance.withNativeMints();

  for (const { id, file } of PROGRAMS) {
    const path = resolveArtifact(file);
    if (!path) {
      throw new Error(
        `Missing program artifact ${file} for ${id}. Run \`anchor build\` and ensure metaplex .so files are vendored under clients/umi/test/programs (see dump.sh).`
      );
    }
    instance.addProgramFromFile(new PublicKey(id).toBytes(), path);
  }

  svm = instance;
  return svm;
}
