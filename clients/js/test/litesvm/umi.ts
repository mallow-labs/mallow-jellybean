import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import {
  createUmi as baseCreateUmi,
  createSignerFromKeypair,
  signerIdentity,
  sol,
  type Keypair,
  type Umi,
} from '@metaplex-foundation/umi';
import { testPlugins } from '@metaplex-foundation/umi-bundle-tests';
import type { LiteSVM } from 'litesvm';
import { LiteSVMConnection } from './connection';

/**
 * Build a umi instance that talks to the *same* LiteSVM the kit client drives, so
 * umi-only scaffolding (mpl-core assets, SPL mints) and kit jellybean/gumball
 * instructions execute against one ledger. The gumball guard client is now
 * kit-based (see `../guard.ts`), so this umi only handles mpl-core/SPL fixtures.
 *
 * The identity keypair is returned so the caller can mirror it as the kit fee
 * payer — the machine authority and the asset authority must be the same key.
 */
export const createUmiForSvm = async (
  svm: LiteSVM
): Promise<{ umi: Umi; keypair: Keypair }> => {
  // The kit `LiteSVM` wrapper stores its NAPI handle on `inner`; the umi
  // connection speaks straight to that handle.
  const inner = (svm as unknown as { inner: unknown }).inner;
  const connection = new LiteSVMConnection(inner as never);

  // testPlugins wires up the LiteSVM connection; mplToolbox registers the SPL
  // token/associated-token programs used by `createMintWithHolders` fixtures.
  const umi = baseCreateUmi()
    .use(testPlugins(connection as never))
    .use(mplToolbox());
  // testPlugins installs a fresh generated identity but does not fund it. Install
  // our own keypair instead (so we can reuse it as the kit payer) and airdrop it
  // the 100 SOL the validator-based createUmi grants on startup.
  const keypair = umi.eddsa.generateKeypair();
  umi.use(signerIdentity(createSignerFromKeypair(umi, keypair)));
  await umi.rpc.airdrop(keypair.publicKey, sol(100));

  return { umi, keypair };
};
