import {
  generateSigner,
  none,
  publicKey,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import test from 'ava';
import {
  BuyBackConfig,
  create,
  fetchGumballMachine,
  GumballMachine,
  GumballSettings,
  updateSettings,
} from '../src';
import { createUmi, defaultGumballSettings } from './_setup';

test('it can update settings', async (t) => {
  // Given an existing collection NFT.
  const umi = await createUmi();

  // When we create a new gumball machine with an associated gumball guard.
  const gumballMachine = generateSigner(umi);
  const createInstructions = await create(umi, {
    gumballMachine,
    settings: defaultGumballSettings(),
  });
  await transactionBuilder().add(createInstructions).sendAndConfirm(umi);

  const newSettings: GumballSettings = {
    ...defaultGumballSettings(),
    uri: 'https://new-example.com',
    itemsPerSeller: 0,
    sellersMerkleRoot: none(),
    curatorFeeBps: 100,
    hideSoldItems: true,
    paymentMint: generateSigner(umi).publicKey,
  };

  await updateSettings(umi, {
    gumballMachine: gumballMachine.publicKey,
    settings: newSettings,
  }).sendAndConfirm(umi);

  // And the created gumball machine uses it as a mint authority.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );
  t.like(gumballMachineAccount, <GumballMachine>{
    publicKey: publicKey(gumballMachine),
    settings: newSettings,
  });
});

test('it can update buy back config', async (t) => {
  // Given an existing collection NFT.
  const umi = await createUmi();

  // When we create a new gumball machine with an associated gumball guard.
  const gumballMachine = generateSigner(umi);
  const createInstructions = await create(umi, {
    gumballMachine,
    settings: defaultGumballSettings(),
  });
  await transactionBuilder().add(createInstructions).sendAndConfirm(umi);

  const buyBackConfig: BuyBackConfig = {
    enabled: true,
    toGumballMachine: true,
    oracleSigner: generateSigner(umi).publicKey,
    valuePct: 50,
    marketplaceFeeBps: 100,
    cutoffPct: 50,
  };

  await updateSettings(umi, {
    gumballMachine: gumballMachine.publicKey,
    settings: defaultGumballSettings(),
    buyBackConfig,
  }).sendAndConfirm(umi);

  // And the created gumball machine uses it as a mint authority.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );
  t.like(gumballMachineAccount, <GumballMachine>{
    publicKey: publicKey(gumballMachine),
    buyBackConfig,
  });
});
