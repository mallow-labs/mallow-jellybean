import { generateKeyPairSigner, none, some } from '@solana/kit';
import test from 'ava';
import { getUpdateSettingsInstruction, type FeeAccountArgs } from '../src';
import {
  createClient,
  createJellybeanMachine,
  fetchJellybeanMachine,
  generateKeyPairSignerWithSol,
  getDefaultFeeAccounts,
  sendTransaction,
} from './_setup';

test('it can update the settings', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      uri: 'https://example.com/metadata.json',
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
    },
  });

  const newFeeAccounts = getDefaultFeeAccounts(
    (await generateKeyPairSigner()).address
  );
  const newUri = 'https://new.example.com/metadata.json';
  const newPrintFeeConfig = some({
    address: (await generateKeyPairSigner()).address,
    amount: 1000n,
  });

  await sendTransaction(client.svm, client.payer, [
    getUpdateSettingsInstruction({
      jellybeanMachine,
      authority: client.payer,
      args: {
        uri: newUri,
        feeAccounts: newFeeAccounts,
        printFeeConfig: newPrintFeeConfig,
      },
    }),
  ]);

  const account = fetchJellybeanMachine(client.svm, jellybeanMachine);
  t.is(account.uri, newUri);
  t.deepEqual(account.feeAccounts, newFeeAccounts);
  t.deepEqual(account.printFeeConfig, newPrintFeeConfig);
});

test('it can update only the uri', async (t) => {
  const client = await createClient();
  const originalFeeAccounts = getDefaultFeeAccounts(client.payer.address);
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      uri: 'https://example.com/metadata.json',
      feeAccounts: originalFeeAccounts,
      printFeeConfig: none(),
    },
  });

  const newUri = 'https://new.example.com/metadata.json';

  await sendTransaction(client.svm, client.payer, [
    getUpdateSettingsInstruction({
      jellybeanMachine,
      authority: client.payer,
      args: {
        uri: newUri,
        feeAccounts: originalFeeAccounts,
        printFeeConfig: none(),
      },
    }),
  ]);

  const account = fetchJellybeanMachine(client.svm, jellybeanMachine);
  t.is(account.uri, newUri);
  t.deepEqual(account.feeAccounts, originalFeeAccounts);
});

test('it can update only the fee account address', async (t) => {
  const client = await createClient();
  const originalFeeAccounts = getDefaultFeeAccounts(client.payer.address);
  const uri = 'https://example.com/metadata.json';
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: { uri, feeAccounts: originalFeeAccounts, printFeeConfig: none() },
  });

  const newFeeAccounts = getDefaultFeeAccounts(
    (await generateKeyPairSigner()).address
  );
  await sendTransaction(client.svm, client.payer, [
    getUpdateSettingsInstruction({
      jellybeanMachine,
      authority: client.payer,
      args: { uri, feeAccounts: newFeeAccounts, printFeeConfig: none() },
    }),
  ]);

  const account = fetchJellybeanMachine(client.svm, jellybeanMachine);
  t.is(account.uri, uri);
  t.deepEqual(account.feeAccounts, newFeeAccounts);
});

test('it fails to update settings with an invalid authority', async (t) => {
  const client = await createClient();
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
        getUpdateSettingsInstruction({
          jellybeanMachine,
          authority: unauthorized,
          args: {
            uri: 'https://new.example.com/metadata.json',
            feeAccounts: getDefaultFeeAccounts(client.payer.address),
            printFeeConfig: none(),
          },
        }),
      ]),
    { message: /ConstraintHasOne/ }
  );
});

test('it fails to update settings with invalid fee accounts', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      uri: 'https://example.com/metadata.json',
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
    },
  });

  const invalidFeeAccounts: FeeAccountArgs[] = [
    { address: client.payer.address, basisPoints: 5000 }, // Not 10000
  ];

  await t.throwsAsync(
    () =>
      sendTransaction(client.svm, client.payer, [
        getUpdateSettingsInstruction({
          jellybeanMachine,
          authority: client.payer,
          args: {
            uri: 'https://new.example.com/metadata.json',
            feeAccounts: invalidFeeAccounts,
            printFeeConfig: none(),
          },
        }),
      ]),
    { message: /InvalidFeeAccountBasisPoints/ }
  );
});

test('it fails to update settings with invalid fee account length', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      uri: 'https://example.com/metadata.json',
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
    },
  });

  const invalidFeeAccounts = getDefaultFeeAccounts(client.payer.address);
  invalidFeeAccounts.push({
    address: (await generateKeyPairSigner()).address,
    basisPoints: 5000,
  });
  invalidFeeAccounts[1].basisPoints -= 5000;

  await t.throwsAsync(
    () =>
      sendTransaction(client.svm, client.payer, [
        getUpdateSettingsInstruction({
          jellybeanMachine,
          authority: client.payer,
          args: {
            uri: 'https://new.example.com/metadata.json',
            feeAccounts: invalidFeeAccounts,
            printFeeConfig: none(),
          },
        }),
      ]),
    { message: /InvalidFeeAccountsLength/ }
  );
});

test('it fails to update settings with a long uri', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await createJellybeanMachine(client, {
    args: {
      uri: 'https://example.com/metadata.json',
      feeAccounts: getDefaultFeeAccounts(client.payer.address),
    },
  });

  const longUri = 'a'.repeat(201);

  await t.throwsAsync(
    () =>
      sendTransaction(client.svm, client.payer, [
        getUpdateSettingsInstruction({
          jellybeanMachine,
          authority: client.payer,
          args: {
            uri: longUri,
            feeAccounts: getDefaultFeeAccounts(client.payer.address),
            printFeeConfig: none(),
          },
        }),
      ]),
    { message: /UriTooLong/ }
  );
});
