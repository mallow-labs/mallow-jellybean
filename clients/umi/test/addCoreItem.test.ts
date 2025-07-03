import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  addCoreItem,
  createJellybeanMachine,
  fetchJellybeanMachineWithItems,
  JellybeanMachineWithItems,
  JellybeanState,
} from '../src';
import { createCoreAsset, createUmi, getDefaultFeeAccounts } from './_setup';

test('it can add a one-of-one asset to a jellybean machine', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const asset = await createCoreAsset(umi);
  await addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    asset: asset.publicKey,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine.publicKey
  );

  t.like(jellybeanMachineAccount, <JellybeanMachineWithItems>{
    publicKey: jellybeanMachine.publicKey,
    version: 0,
    authority: umi.identity.publicKey,
    mintAuthority: umi.identity.publicKey,
    itemsLoaded: 1,
    supplyLoaded: 1n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [
      {
        address: umi.identity.publicKey,
        basisPoints: 10000,
      },
    ],
    items: [
      {
        index: 0,
        mint: asset.publicKey,
        supplyLoaded: 1,
        supplyRedeemed: 0,
        supplyClaimed: 0,
      },
    ],
  });
});
