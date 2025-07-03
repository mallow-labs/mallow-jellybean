import { generateSigner, sol } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  createJellybeanMachine,
  FeeAccount,
  fetchJellybeanMachine,
  initialize,
  JellybeanState,
} from '../src';
import {
  createUmi,
  DEFAULT_MARKETPLACE_FEE_BASIS_POINTS,
  getDefaultFeeAccounts,
} from './_setup';

test('it can initialize a jellybean machine with basic parameters', async (t) => {
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

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );

  t.like(jellybeanMachineAccount, {
    publicKey: jellybeanMachine.publicKey,
    version: 0,
    authority: umi.identity.publicKey,
    mintAuthority: umi.identity.publicKey,
    itemsLoaded: 0,
    supplyLoaded: 0n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [
      {
        address: umi.identity.publicKey,
        basisPoints: 10000,
      },
    ],
  });
});

test('it can initialize a jellybean machine with multiple fee accounts', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const marketplaceFeeAccount = generateSigner(umi).publicKey;
  const feeAccounts = getDefaultFeeAccounts(
    umi.identity.publicKey,
    marketplaceFeeAccount
  );

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );

  t.like(jellybeanMachineAccount, {
    publicKey: jellybeanMachine.publicKey,
    version: 0,
    authority: umi.identity.publicKey,
    mintAuthority: umi.identity.publicKey,
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
        address: umi.identity.publicKey,
        basisPoints: 10000 - DEFAULT_MARKETPLACE_FEE_BASIS_POINTS,
      },
    ],
  });
});

test('it can initialize a jellybean machine with custom authority', async (t) => {
  const umi = await createUmi();
  const customAuthority = await generateSignerWithSol(umi);
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(customAuthority.publicKey);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      authority: customAuthority.publicKey,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );

  t.like(jellybeanMachineAccount, {
    publicKey: jellybeanMachine.publicKey,
    version: 0,
    authority: customAuthority.publicKey,
    mintAuthority: customAuthority.publicKey,
    itemsLoaded: 0,
    supplyLoaded: 0n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [
      {
        address: customAuthority.publicKey,
        basisPoints: 10000,
      },
    ],
  });
});

test('it can initialize a jellybean machine with empty fee accounts', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts: FeeAccount[] = [];

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );

  t.like(jellybeanMachineAccount, {
    publicKey: jellybeanMachine.publicKey,
    version: 0,
    authority: umi.identity.publicKey,
    mintAuthority: umi.identity.publicKey,
    itemsLoaded: 0,
    supplyLoaded: 0n,
    supplyRedeemed: 0n,
    state: JellybeanState.None,
    uri,
    feeAccounts: [],
  });
});

test('it can initialize a jellybean machine with maximum length URI', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  // Maximum URI length is 196 characters based on the padding size
  const uri = 'https://example.com/' + 'a'.repeat(172); // 192 total characters
  t.is(uri.length, 192);
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );

  t.like(jellybeanMachineAccount, {
    uri,
  });
  t.is(jellybeanMachineAccount.uri.length, 192);
});

test('it fails to reinitialize an already initialized jellybean machine', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  // First initialization should succeed
  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  // Second initialization should fail
  await t.throwsAsync(
    () =>
      initialize(umi, {
        jellybeanMachine: jellybeanMachine.publicKey,
        args: {
          feeAccounts,
          uri: 'https://example.com/different.json',
        },
      }).sendAndConfirm(umi),
    {
      message: /already in use/,
    }
  );
});

test('it fails to initialize with excessively long URI', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  // URI that's too long (over 196 characters)
  const uri = 'https://example.com/' + 'a'.repeat(178); // 197 total characters
  const feeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await t.throwsAsync(
    () =>
      createJellybeanMachine(umi, {
        jellybeanMachine,
        args: { feeAccounts, uri },
      }).then((tx) => tx.sendAndConfirm(umi)),
    { message: /UriTooLong/ }
  );
});

test('it fails to initialize with insufficient payer balance', async (t) => {
  const umi = await createUmi();
  const poorSigner = await generateSignerWithSol(umi, sol(0.0001));
  const poorUmi = await createUmi(poorSigner);
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts = getDefaultFeeAccounts(poorSigner.publicKey);

  await t.throwsAsync(
    () =>
      createJellybeanMachine(poorUmi, {
        jellybeanMachine,
        args: { feeAccounts, uri },
      }).then((tx) => tx.sendAndConfirm(poorUmi)),
    { message: /Attempt to debit an account but found no record/ }
  );
});

test('it fails to initialize with fee accounts that sum to less than 10000 basis points', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const feeAccounts: FeeAccount[] = [
    {
      address: umi.identity.publicKey,
      basisPoints: 5000, // Only 50%
    },
  ];

  await t.throwsAsync(
    () =>
      createJellybeanMachine(umi, {
        jellybeanMachine,
        args: { feeAccounts, uri },
      }).then((tx) => tx.sendAndConfirm(umi)),
    { message: /InvalidFeeAccountBasisPoints/ }
  );
});

test('it fails to initialize with fee accounts that sum to more than 10000 basis points', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const marketplaceFeeAccount = generateSigner(umi).publicKey;
  const feeAccounts: FeeAccount[] = [
    {
      address: marketplaceFeeAccount,
      basisPoints: 6000, // 60%
    },
    {
      address: umi.identity.publicKey,
      basisPoints: 5000, // 50% - totals 110%
    },
  ];

  await t.throwsAsync(
    () =>
      createJellybeanMachine(umi, {
        jellybeanMachine,
        args: { feeAccounts, uri },
      }).then((tx) => tx.sendAndConfirm(umi)),
    { message: /InvalidFeeAccountBasisPoints/ }
  );
});

test('it fails to initialize with multiple fee accounts that do not sum to 10000', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const account1 = generateSigner(umi).publicKey;
  const account2 = generateSigner(umi).publicKey;
  const account3 = generateSigner(umi).publicKey;
  const feeAccounts: FeeAccount[] = [
    {
      address: account1,
      basisPoints: 2000, // 20%
    },
    {
      address: account2,
      basisPoints: 3000, // 30%
    },
    {
      address: account3,
      basisPoints: 4000, // 40% - totals 90%
    },
  ];

  await t.throwsAsync(
    () =>
      createJellybeanMachine(umi, {
        jellybeanMachine,
        args: { feeAccounts, uri },
      }).then((tx) => tx.sendAndConfirm(umi)),
    { message: /InvalidFeeAccountBasisPoints/ }
  );
});

test('it allows initialization with properly distributed fee accounts', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const uri = 'https://example.com/metadata.json';
  const account1 = generateSigner(umi).publicKey;
  const account2 = generateSigner(umi).publicKey;
  const account3 = generateSigner(umi).publicKey;
  const feeAccounts: FeeAccount[] = [
    {
      address: account1,
      basisPoints: 3000, // 30%
    },
    {
      address: account2,
      basisPoints: 3000, // 30%
    },
    {
      address: account3,
      basisPoints: 4000, // 40% - totals 100%
    },
  ];

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: { feeAccounts, uri },
    })
  ).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );

  t.like(jellybeanMachineAccount, {
    feeAccounts: [
      {
        address: account1,
        basisPoints: 3000,
      },
      {
        address: account2,
        basisPoints: 3000,
      },
      {
        address: account3,
        basisPoints: 4000,
      },
    ],
  });
});
