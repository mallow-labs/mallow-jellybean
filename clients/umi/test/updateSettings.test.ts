import { generateSigner, none, some } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  createJellybeanMachine,
  fetchJellybeanMachine,
  updateSettings,
} from '../src';
import { createUmi, getDefaultFeeAccounts } from './_setup';

test('it can update the settings', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: {
        uri: 'https://example.com/metadata.json',
        feeAccounts: getDefaultFeeAccounts(umi.identity.publicKey),
      },
    })
  ).sendAndConfirm(umi);

  const newFeeAccounts = getDefaultFeeAccounts(generateSigner(umi).publicKey);
  const newUri = 'https://new.example.com/metadata.json';
  const newPrintFeeConfig = some({
    address: generateSigner(umi).publicKey,
    amount: 1000n,
  });

  await updateSettings(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    args: {
      uri: newUri,
      feeAccounts: newFeeAccounts,
      printFeeConfig: newPrintFeeConfig,
    },
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.uri, newUri);
  t.deepEqual(jellybeanMachineAccount.feeAccounts, newFeeAccounts);
  t.deepEqual(jellybeanMachineAccount.printFeeConfig, newPrintFeeConfig);
});

test('it can update only the uri', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const originalFeeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: {
        uri: 'https://example.com/metadata.json',
        feeAccounts: originalFeeAccounts,
        printFeeConfig: none(),
      },
    })
  ).sendAndConfirm(umi);

  const newUri = 'https://new.example.com/metadata.json';

  await updateSettings(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    args: {
      uri: newUri,
      feeAccounts: originalFeeAccounts,
      printFeeConfig: none(),
    },
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.uri, newUri);
  t.deepEqual(jellybeanMachineAccount.feeAccounts, originalFeeAccounts);
});

test('it can update only the fee account address', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);
  const originalFeeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);
  const uri = 'https://example.com/metadata.json';

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: {
        uri,
        feeAccounts: originalFeeAccounts,
        printFeeConfig: none(),
      },
    })
  ).sendAndConfirm(umi);

  const newFeeAccounts = getDefaultFeeAccounts(generateSigner(umi).publicKey);
  await updateSettings(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    args: {
      uri,
      feeAccounts: newFeeAccounts,
      printFeeConfig: none(),
    },
  }).sendAndConfirm(umi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    umi,
    jellybeanMachine.publicKey
  );
  t.is(jellybeanMachineAccount.uri, uri);
  t.deepEqual(jellybeanMachineAccount.feeAccounts, newFeeAccounts);
});

test('it fails to update settings with an invalid authority', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);

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

  const promise = updateSettings(unauthorizedUmi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    args: {
      uri: 'https://new.example.com/metadata.json',
      feeAccounts: getDefaultFeeAccounts(umi.identity.publicKey),
      printFeeConfig: none(),
    },
  }).sendAndConfirm(unauthorizedUmi);

  await t.throwsAsync(promise, {
    message: /ConstraintHasOne/,
  });
});

test('it fails to update settings with invalid fee accounts', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: {
        uri: 'https://example.com/metadata.json',
        feeAccounts: getDefaultFeeAccounts(umi.identity.publicKey),
      },
    })
  ).sendAndConfirm(umi);

  const invalidFeeAccounts = [
    {
      address: umi.identity.publicKey,
      basisPoints: 5000, // Not 10000
    },
  ];

  const promise = updateSettings(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    args: {
      uri: 'https://new.example.com/metadata.json',
      feeAccounts: invalidFeeAccounts,
      printFeeConfig: none(),
    },
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /InvalidFeeAccountBasisPoints/,
  });
});

test('it fails to update settings with invalid fee account length', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: {
        uri: 'https://example.com/metadata.json',
        feeAccounts: getDefaultFeeAccounts(umi.identity.publicKey),
      },
    })
  ).sendAndConfirm(umi);

  const invalidFeeAccounts = getDefaultFeeAccounts(umi.identity.publicKey);
  invalidFeeAccounts.push({
    address: generateSigner(umi).publicKey,
    basisPoints: 5000,
  });
  invalidFeeAccounts[1].basisPoints -= 5000;

  const promise = updateSettings(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    args: {
      uri: 'https://new.example.com/metadata.json',
      feeAccounts: invalidFeeAccounts,
      printFeeConfig: none(),
    },
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /InvalidFeeAccountsLength/,
  });
});

test('it fails to update settings with a long uri', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = generateSigner(umi);

  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: {
        uri: 'https://example.com/metadata.json',
        feeAccounts: getDefaultFeeAccounts(umi.identity.publicKey),
      },
    })
  ).sendAndConfirm(umi);

  const longUri = 'a'.repeat(201);

  const promise = updateSettings(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    args: {
      uri: longUri,
      feeAccounts: getDefaultFeeAccounts(umi.identity.publicKey),
      printFeeConfig: none(),
    },
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /UriTooLong/,
  });
});
