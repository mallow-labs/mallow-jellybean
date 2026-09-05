import { generateKeyPairSigner } from '@solana/kit';
import test from 'ava';
import { getSetMintAuthorityInstruction } from '../src';
import {
  createClient,
  createJellybeanMachine,
  fetchJellybeanMachine,
  generateKeyPairSignerWithSol,
  getDefaultFeeAccounts,
  sendTransaction,
} from './_setup';

test('it can set a new mint authority', async (t) => {
  const client = await createClient();
  const newMintAuthority = await generateKeyPairSigner();

  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      uri: 'https://example.com/metadata.json',
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
    },
  });

  await sendTransaction(client.svm, client.payer, [
    getSetMintAuthorityInstruction({
      jellybeanMachine,
      authority: client.payer,
      mintAuthority: newMintAuthority,
    }),
  ]);

  const account = fetchJellybeanMachine(client.svm, jellybeanMachine);
  t.is(account.mintAuthority, newMintAuthority.address);
});

test('it fails to set a new mint authority with an invalid authority', async (t) => {
  const client = await createClient();
  const newMintAuthority = await generateKeyPairSigner();

  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      uri: 'https://example.com/metadata.json',
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
    },
  });

  const unauthorized = await generateKeyPairSignerWithSol(client.svm);

  await t.throwsAsync(
    () =>
      sendTransaction(client.svm, unauthorized, [
        getSetMintAuthorityInstruction({
          jellybeanMachine,
          authority: unauthorized,
          mintAuthority: newMintAuthority,
        }),
      ]),
    { message: /ConstraintHasOne/ }
  );
});
