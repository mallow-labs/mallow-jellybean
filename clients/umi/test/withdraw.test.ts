import { generateSigner } from '@metaplex-foundation/umi';
import test from 'ava';
import {
  closeJellybeanMachine,
  createJellybeanMachine,
  safeFetchJellybeanMachine,
  withdraw,
} from '../src/';
import { create, createUmi, getDefaultFeeAccounts } from './_setup';

test('it can close a jellybean machine', async (t) => {
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

  await withdraw(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await safeFetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.falsy(jellybeanMachineAccount);
});

test('it can close a jellybean machine with a guard', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await create(umi, {
    jellybeanMachine,
    args: { feeAccounts, uri },
  });

  await closeJellybeanMachine(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await safeFetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.falsy(jellybeanMachineAccount);
});
