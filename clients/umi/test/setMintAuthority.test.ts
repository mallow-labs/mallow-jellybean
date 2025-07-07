import { generateSigner } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  createJellybeanMachine,
  fetchJellybeanMachine,
  setMintAuthority,
} from '../src';
import { createUmi, getDefaultFeeAccounts } from './_setup';

test('it can set a new mint authority', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const newMintAuthority = generateSigner(umi);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: {
        uri: 'https://example.com/metadata.json',
        feeAccounts: getDefaultFeeAccounts(umi.identity.publicKey),
      },
    })
  ).sendAndConfirm(umi);

  await setMintAuthority(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    mintAuthority: newMintAuthority,
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.mintAuthority, newMintAuthority.publicKey);
});

test('it fails to set a new mint authority with an invalid authority', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const newMintAuthority = generateSigner(umi);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: {
        uri: 'https://example.com/metadata.json',
        feeAccounts: getDefaultFeeAccounts(umi.identity.publicKey),
      },
    })
  ).sendAndConfirm(umi);

  const unauthorizedSigner = await generateSignerWithSol(umi);
  const unauthorizedUmi = await createUmi(unauthorizedSigner);

  const promise = setMintAuthority(unauthorizedUmi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    mintAuthority: newMintAuthority,
  }).sendAndConfirm(unauthorizedUmi);

  await t.throwsAsync(promise, {
    message: /ConstraintHasOne/,
  });
});
