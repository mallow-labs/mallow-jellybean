import {
  CheckResult,
  createCollection,
  createV1,
  fetchAsset,
  fetchCollection,
  transfer,
} from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey, Umi } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import {
  addCoreItem,
  createJellybeanMachine,
  fetchJellybeanMachineWithItems,
  JellybeanMachineWithItems,
  JellybeanState,
  startSale,
} from '../src';
import {
  createCoreAsset,
  createMasterEdition,
  createUmi,
  DEFAULT_MAX_SUPPLY,
  defaultAssetData,
  getDefaultFeeAccounts,
} from './_setup';

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

test('it can add a master edition asset to a jellybean machine', async (t) => {
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

  const collection = await createMasterEdition(umi);
  await addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    collection: collection.publicKey,
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
    supplyLoaded: BigInt(DEFAULT_MAX_SUPPLY),
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
        mint: collection.publicKey,
        supplyLoaded: DEFAULT_MAX_SUPPLY,
        supplyRedeemed: 0,
        supplyClaimed: 0,
      },
    ],
  });

  t.true(jellybeanMachineAccount.items[0].escrowAmount > 0);
});

test('it cannot add an item if the machine is started', async (t) => {
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

  await startSale(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
  }).sendAndConfirm(umi);

  const asset2 = await createCoreAsset(umi);
  const promise = addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    asset: asset2.publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /InvalidState/,
  });
});

test('it cannot add a collection that is not a master edition', async (t) => {
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

  const collection = await createMasterEdition(umi, {
    plugins: [],
  });
  const promise = addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    collection: collection.publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /MissingMasterEdition/,
  });
});

test('it cannot add a master edition with infinite supply', async (t) => {
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

  const collection = await createMasterEdition(umi, { maxSupply: undefined });
  const promise = addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    collection: collection.publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /InvalidMasterEditionSupply/,
  });
});

test('it cannot add a master edition with existing prints', async (t) => {
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

  const collection = await createMasterEdition(umi);

  // Mint a print from the master edition
  await createV1(umi, {
    asset: generateSigner(umi),
    collection: collection.publicKey,
    name: 'My Asset',
    uri: 'https://example.com/my-asset.json',
  }).sendAndConfirm(umi);

  const promise = addCoreItem(umi, {
    jellybeanMachine: jellybeanMachine.publicKey,
    collection: collection.publicKey,
  }).sendAndConfirm(umi);

  await t.throwsAsync(promise, {
    message: /MasterEditionNotEmpty/,
  });
});

const createEmptyMachine = async (umi: Umi) => {
  const jellybeanMachine = generateSigner(umi);
  await (
    await createJellybeanMachine(umi, {
      jellybeanMachine,
      args: {
        feeAccounts: getDefaultFeeAccounts(umi.identity.publicKey),
        uri: 'https://example.com/metadata.json',
      },
    })
  ).sendAndConfirm(umi);
  return jellybeanMachine.publicKey;
};

const createCollectionWithPlugins = async (umi: Umi, plugins: any[]) => {
  const collection = generateSigner(umi);
  await createCollection(umi, {
    collection,
    ...defaultAssetData(),
    plugins,
  }).sendAndConfirm(umi);
  return collection;
};

const ORACLE_ADDRESS = publicKey('11111111111111111111111111111112');
const oraclePlugin = (lifecycleChecks: object) => ({
  type: 'Oracle',
  baseAddress: ORACLE_ADDRESS,
  lifecycleChecks,
  resultsOffset: { type: 'Anchor' },
});

for (const plugin of [
  { type: 'PermanentTransferDelegate' },
  { type: 'PermanentFreezeDelegate', frozen: false },
  { type: 'PermanentBurnDelegate' },
  oraclePlugin({ burn: [CheckResult.CAN_REJECT] }),
]) {
  test(`it refuses an asset carrying ${plugin.type}`, async (t) => {
    const umi = await createUmi();
    const jellybeanMachine = await createEmptyMachine(umi);
    const asset = await createCoreAsset(umi, { plugins: [plugin as any] });

    await t.throwsAsync(
      () =>
        addCoreItem(umi, {
          jellybeanMachine,
          asset: asset.publicKey,
        }).sendAndConfirm(umi),
      { message: /RetainedItemControl/ }
    );
  });

  test(`it refuses an asset whose collection carries ${plugin.type}`, async (t) => {
    const umi = await createUmi();
    const jellybeanMachine = await createEmptyMachine(umi);
    const collectionSigner = await createCollectionWithPlugins(umi, [plugin]);
    const collection = await fetchCollection(umi, collectionSigner.publicKey);
    const asset = await createCoreAsset(umi, { plugins: [], collection });

    await t.throwsAsync(
      () =>
        addCoreItem(umi, {
          jellybeanMachine,
          asset: asset.publicKey,
          collection: collectionSigner.publicKey,
        }).sendAndConfirm(umi),
      { message: /RetainedItemControl/ }
    );
  });
}

test('it refuses an asset of a collection left out of the accounts', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = await createEmptyMachine(umi);
  const collectionSigner = await createCollectionWithPlugins(umi, [
    { type: 'PermanentTransferDelegate' },
  ]);
  const collection = await fetchCollection(umi, collectionSigner.publicKey);
  const asset = await createCoreAsset(umi, { plugins: [], collection });

  await t.throwsAsync(
    () =>
      addCoreItem(umi, {
        jellybeanMachine,
        asset: asset.publicKey,
      }).sendAndConfirm(umi),
    { message: /InvalidAsset/ }
  );
});

test('it refuses an asset passed with a collection it is not in', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = await createEmptyMachine(umi);
  const realCollectionSigner = await createCollectionWithPlugins(umi, [
    { type: 'PermanentTransferDelegate' },
  ]);
  const otherCollection = await createCollectionWithPlugins(umi, []);
  const collection = await fetchCollection(umi, realCollectionSigner.publicKey);
  const asset = await createCoreAsset(umi, { plugins: [], collection });

  await t.throwsAsync(
    () =>
      addCoreItem(umi, {
        jellybeanMachine,
        asset: asset.publicKey,
        collection: otherCollection.publicKey,
      }).sendAndConfirm(umi),
    { message: /InvalidAsset/ }
  );
});

test('it can add assets with no plugins and in a plain collection', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = await createEmptyMachine(umi);
  const bareAsset = await createCoreAsset(umi, { plugins: [] });
  const collectionSigner = await createCollectionWithPlugins(umi, []);
  const collection = await fetchCollection(umi, collectionSigner.publicKey);
  const collectionAsset = await createCoreAsset(umi, {
    plugins: [],
    collection,
  });

  await addCoreItem(umi, {
    jellybeanMachine,
    asset: bareAsset.publicKey,
  })
    .add(
      addCoreItem(umi, {
        jellybeanMachine,
        asset: collectionAsset.publicKey,
        collection: collectionSigner.publicKey,
      })
    )
    .sendAndConfirm(umi);

  const { itemsLoaded } = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(itemsLoaded, 2);
});

test('it can add an asset with plugins that hold no control', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = await createEmptyMachine(umi);
  const asset = await createCoreAsset(umi, {
    plugins: [
      { type: 'Attributes', attributeList: [] },
      {
        type: 'AppData',
        dataAuthority: { type: 'UpdateAuthority' },
        schema: 0,
      },
    ] as any,
  });

  await addCoreItem(umi, {
    jellybeanMachine,
    asset: asset.publicKey,
  }).sendAndConfirm(umi);

  t.pass();
});

test('an owner-managed delegate loses its hold on the way into custody', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = await createEmptyMachine(umi);
  const delegate = await generateSignerWithSol(umi);
  const delegateUmi = await createUmi(delegate);
  const authority = { type: 'Address', address: delegate.publicKey };
  const assetSigner = await createCoreAsset(umi, {
    plugins: [
      { type: 'TransferDelegate', authority },
      { type: 'BurnDelegate', authority },
    ] as any,
  });

  await addCoreItem(umi, {
    jellybeanMachine,
    asset: assetSigner.publicKey,
  }).sendAndConfirm(umi);

  const asset = await fetchAsset(umi, assetSigner.publicKey);
  t.is(asset.transferDelegate?.authority.type, 'Owner');
  await t.throwsAsync(() =>
    transfer(delegateUmi, {
      asset,
      newOwner: delegate.publicKey,
    }).sendAndConfirm(delegateUmi)
  );
});

const masterEdition = (extra: object = {}) => ({
  type: 'MasterEdition',
  maxSupply: DEFAULT_MAX_SUPPLY,
  ...extra,
});
const secondKeyAuthority = (umi: Umi) => ({
  type: 'Address',
  address: generateSigner(umi).publicKey,
});

for (const [name, getPlugins] of [
  [
    'an update delegate held by another key',
    (umi: Umi) => [
      masterEdition(),
      {
        type: 'UpdateDelegate',
        additionalDelegates: [],
        authority: secondKeyAuthority(umi),
      },
    ],
  ],
  [
    'additional update delegates',
    (umi: Umi) => [
      masterEdition(),
      {
        type: 'UpdateDelegate',
        additionalDelegates: [generateSigner(umi).publicKey],
      },
    ],
  ],
  [
    'a master edition plugin held by another key',
    (umi: Umi) => [masterEdition({ authority: secondKeyAuthority(umi) })],
  ],
  [
    'a permanent delegate',
    () => [masterEdition(), { type: 'PermanentBurnDelegate' }],
  ],
  [
    'an oracle that can veto the print',
    () => [masterEdition(), oraclePlugin({ create: [CheckResult.CAN_REJECT] })],
  ],
] as [string, (umi: Umi) => any[]][]) {
  test(`it refuses a master edition with ${name}`, async (t) => {
    const umi = await createUmi();
    const jellybeanMachine = await createEmptyMachine(umi);
    const collection = await createCollectionWithPlugins(umi, getPlugins(umi));

    await t.throwsAsync(
      () =>
        addCoreItem(umi, {
          jellybeanMachine,
          collection: collection.publicKey,
        }).sendAndConfirm(umi),
      { message: /RetainedItemControl/ }
    );
  });
}

test('it can add a master edition whose update delegate was revoked', async (t) => {
  const umi = await createUmi();
  const jellybeanMachine = await createEmptyMachine(umi);
  const collection = await createCollectionWithPlugins(umi, [
    masterEdition(),
    { type: 'UpdateDelegate', additionalDelegates: [] },
  ]);

  await addCoreItem(umi, {
    jellybeanMachine,
    collection: collection.publicKey,
  }).sendAndConfirm(umi);

  const { itemsLoaded } = await fetchJellybeanMachineWithItems(
    umi,
    jellybeanMachine
  );
  t.is(itemsLoaded, 1);
});
