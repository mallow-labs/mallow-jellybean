import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import { endSale, fetchJellybeanMachine, JellybeanState } from '../src';
import { create, createCoreAsset, createUmi } from './_setup';

test('it can end a sale', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const assetSigner = await createCoreAsset(umi);

  await create(umi, {
    jellybeanMachine,
    startSale: true,
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
  });

  await endSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.state, JellybeanState.SaleEnded);
});
