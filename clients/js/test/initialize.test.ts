import { generateKeyPairSigner } from '@solana/kit';
import test from 'ava';
import {
  getInitializeInstructionAsync,
  JellybeanState,
  type FeeAccountArgs,
} from '../src';
import {
  createClient,
  createJellybeanMachine,
  DEFAULT_MARKETPLACE_FEE_BASIS_POINTS,
  fetchJellybeanMachine,
  generateKeyPairSignerWithSol,
  getDefaultFeeAccounts,
  sendTransaction,
  sol,
} from './_setup';

test('it can initialize a jellybean machine with basic parameters', async (t) => {
  const client = await createClient();
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(client.payer.address);

  const machine = await createJellybeanMachine(client, {
    args: { feeAccounts, uri },
  });

  const account = fetchJellybeanMachine(client.svm, machine);

  t.like(account, {
    version: 0,
    authority: client.payer.address,
    mintAuthority: client.payer.address,
    itemsLoaded: 0,
    supplyLoaded: 0n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [
      {
        address: client.payer.address,
        basisPoints: 10000,
      },
    ],
  });
});

test('it can initialize a jellybean machine with multiple fee accounts', async (t) => {
  const client = await createClient();
  const uri = 'https://example.com/metadata.json';
  const marketplaceFeeAccount = (await generateKeyPairSigner()).address;
  const feeAccounts = getDefaultFeeAccounts(
    client.payer.address,
    marketplaceFeeAccount
  );

  const machine = await createJellybeanMachine(client, {
    args: { feeAccounts, uri },
  });

  const account = fetchJellybeanMachine(client.svm, machine);

  t.like(account, {
    version: 0,
    authority: client.payer.address,
    mintAuthority: client.payer.address,
    itemsLoaded: 0,
    supplyLoaded: 0n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [
      {
        address: marketplaceFeeAccount,
        basisPoints: DEFAULT_MARKETPLACE_FEE_BASIS_POINTS,
      },
      {
        address: client.payer.address,
        basisPoints: 10000 - DEFAULT_MARKETPLACE_FEE_BASIS_POINTS,
      },
    ],
  });
});

test('it can initialize a jellybean machine with custom authority', async (t) => {
  const client = await createClient();
  const customAuthority = await generateKeyPairSignerWithSol(client.svm);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(customAuthority.address);

  const machine = await createJellybeanMachine(client, {
    authority: customAuthority.address,
    args: { feeAccounts, uri },
  });

  const account = fetchJellybeanMachine(client.svm, machine);

  t.like(account, {
    version: 0,
    authority: customAuthority.address,
    mintAuthority: customAuthority.address,
    itemsLoaded: 0,
    supplyLoaded: 0n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [
      {
        address: customAuthority.address,
        basisPoints: 10000,
      },
    ],
  });
});

test('it can initialize a jellybean machine with empty fee accounts', async (t) => {
  const client = await createClient();
  const uri = 'https://example.com/metadata.json';
  const feeAccounts: FeeAccountArgs[] = [];

  const machine = await createJellybeanMachine(client, {
    args: { feeAccounts, uri },
  });

  const account = fetchJellybeanMachine(client.svm, machine);

  t.like(account, {
    version: 0,
    authority: client.payer.address,
    mintAuthority: client.payer.address,
    itemsLoaded: 0,
    supplyLoaded: 0n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
  });
  t.deepEqual(account.feeAccounts, []);
});

test('it can initialize a jellybean machine with maximum length URI', async (t) => {
  const client = await createClient();
  // Maximum URI length is 196 characters based on the padding size.
  const uri = 'https://example.com/' + 'a'.repeat(172); // 192 total characters
  t.is(uri.length, 192);
  const feeAccounts = getDefaultFeeAccounts(client.payer.address);

  const machine = await createJellybeanMachine(client, {
    args: { feeAccounts, uri },
  });

  const account = fetchJellybeanMachine(client.svm, machine);
  t.is(account.uri, uri);
  t.is(account.uri.length, 192);
});

test('it fails to reinitialize an already initialized jellybean machine', async (t) => {
  const client = await createClient();
  const jellybeanMachine = await generateKeyPairSigner();
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(client.payer.address);

  // First initialization should succeed.
  await createJellybeanMachine(client, {
    jellybeanMachine,
    args: { feeAccounts, uri },
  });

  // Second initialization (raw instruction, account already exists) should fail.
  const reinitializeIx = await getInitializeInstructionAsync({
    jellybeanMachine: jellybeanMachine.address,
    authority: client.payer.address,
    payer: client.payer,
    args: { feeAccounts, uri: 'https://example.com/different.json' },
  });
  await t.throwsAsync(
    () => sendTransaction(client.svm, client.payer, [reinitializeIx]),
    { message: /already in use/ }
  );
});

test('it fails to initialize with excessively long URI', async (t) => {
  const client = await createClient();
  // URI that's too long (over 196 characters).
  const uri = 'https://example.com/' + 'a'.repeat(178); // 197 total characters
  const feeAccounts = getDefaultFeeAccounts(client.payer.address);

  await t.throwsAsync(
    () => createJellybeanMachine(client, { args: { feeAccounts, uri } }),
    { message: /UriTooLong/ }
  );
});

test('it fails to initialize with insufficient payer balance', async (t) => {
  const client = await createClient();
  const poorPayer = await generateKeyPairSignerWithSol(client.svm, sol(0.0001));
  const poorClient = { svm: client.svm, umi: client.umi, payer: poorPayer };
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(poorPayer.address);

  await t.throwsAsync(
    () => createJellybeanMachine(poorClient, { args: { feeAccounts, uri } }),
    // LiteSVM reports the too-poor fee payer as AccountNotFound (the raw error
    // behind web3.js's "Attempt to debit an account but found no record").
    { message: /insufficient lamports|AccountNotFound/ }
  );
});

test('it fails to initialize with fee accounts that sum to less than 10000 basis points', async (t) => {
  const client = await createClient();
  const uri = 'https://example.com/metadata.json';
  const feeAccounts: FeeAccountArgs[] = [
    { address: client.payer.address, basisPoints: 5000 }, // Only 50%
  ];

  await t.throwsAsync(
    () => createJellybeanMachine(client, { args: { feeAccounts, uri } }),
    { message: /InvalidFeeAccountBasisPoints/ }
  );
});

test('it fails to initialize with fee accounts that sum to more than 10000 basis points', async (t) => {
  const client = await createClient();
  const uri = 'https://example.com/metadata.json';
  const marketplaceFeeAccount = (await generateKeyPairSigner()).address;
  const feeAccounts: FeeAccountArgs[] = [
    { address: marketplaceFeeAccount, basisPoints: 6000 }, // 60%
    { address: client.payer.address, basisPoints: 5000 }, // 50% - totals 110%
  ];

  await t.throwsAsync(
    () => createJellybeanMachine(client, { args: { feeAccounts, uri } }),
    { message: /InvalidFeeAccountBasisPoints/ }
  );
});

test('it fails to initialize with multiple fee accounts that do not sum to 10000', async (t) => {
  const client = await createClient();
  const uri = 'https://example.com/metadata.json';
  const account1 = (await generateKeyPairSigner()).address;
  const account2 = (await generateKeyPairSigner()).address;
  const account3 = (await generateKeyPairSigner()).address;
  const feeAccounts: FeeAccountArgs[] = [
    { address: account1, basisPoints: 2000 }, // 20%
    { address: account2, basisPoints: 3000 }, // 30%
    { address: account3, basisPoints: 4000 }, // 40% - totals 90%
  ];

  await t.throwsAsync(
    () => createJellybeanMachine(client, { args: { feeAccounts, uri } }),
    { message: /InvalidFeeAccountBasisPoints/ }
  );
});

test('it allows initialization with properly distributed fee accounts', async (t) => {
  const client = await createClient();
  const uri = 'https://example.com/metadata.json';
  const account1 = (await generateKeyPairSigner()).address;
  const account2 = (await generateKeyPairSigner()).address;
  const account3 = (await generateKeyPairSigner()).address;
  const feeAccounts: FeeAccountArgs[] = [
    { address: account1, basisPoints: 3000 }, // 30%
    { address: account2, basisPoints: 3000 }, // 30%
    { address: account3, basisPoints: 4000 }, // 40% - totals 100%
  ];

  const machine = await createJellybeanMachine(client, {
    args: { feeAccounts, uri },
  });

  const account = fetchJellybeanMachine(client.svm, machine);
  t.deepEqual(account.feeAccounts, feeAccounts);
});
