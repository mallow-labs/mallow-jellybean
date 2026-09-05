import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { address } from '@solana/kit';
import { LiteSVM } from 'litesvm';

/**
 * Programs loaded into each LiteSVM instance.
 *
 *  - `mallow_jellybean.so` is produced by `anchor build` (repo `target/deploy`).
 *  - `mpl_core.so` / `gumball_guard.so` are mainnet dumps vendored under
 *    `clients/umi/test/programs` (see that folder's `dump.sh`); the kit client's
 *    fixtures reuse them via umi for asset/guard scaffolding.
 *
 * SPL Token, Token-2022 and the associated-token program are built into the
 * LiteSVM standard runtime (`withDefaultPrograms`), so they don't need loading.
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
 * from a normal run, regardless of how deep the caller sits.
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

/**
 * Create a fresh LiteSVM with all mallow + metaplex programs loaded. AVA runs
 * each test file in its own worker process and each test builds its own SVM, so
 * state is naturally isolated per test.
 */
export function createSvm(): LiteSVM {
  const svm = new LiteSVM()
    .withSysvars()
    .withBuiltins()
    .withDefaultPrograms()
    // Seed the SPL Token / Token-2022 native mint accounts (wSOL).
    .withNativeMints()
    // Disable duplicate-signature history so a logically-identical resend
    // re-executes and surfaces the program-level error the negative tests
    // assert, instead of being rejected as AlreadyProcessed (LiteSVM keeps a
    // single valid blockhash, so it can't rotate to make a resend unique).
    .withTransactionHistory(0n);

  for (const { id, file } of PROGRAMS) {
    const path = resolveArtifact(file);
    if (!path) {
      throw new Error(
        `Missing program artifact ${file} for ${id}. Run \`anchor build\` and ensure the metaplex .so files are vendored under clients/umi/test/programs (see dump.sh).`
      );
    }
    svm.addProgramFromFile(address(id), path);
  }

  return svm;
}
