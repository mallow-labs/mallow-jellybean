# @mallow-labs/mallow-jellybean-umi

<a href="https://www.npmjs.com/package/@mallow-labs/mallow-jellybean-umi"><img src="https://img.shields.io/npm/v/@mallow-labs/mallow-jellybean-umi?logo=npm&color=377CC0" /></a>

A UMI-based TypeScript client for the [Mallow Jellybean](../../README.md) program. Provides fully-typed instruction builders, account fetchers, and helpers for creating and managing jellybean machines with support for one-of-one Core assets and limited edition drops.

## Installation

```sh
npm install @mallow-labs/mallow-jellybean-umi @metaplex-foundation/umi @metaplex-foundation/mpl-core
# or
pnpm add @mallow-labs/mallow-jellybean-umi @metaplex-foundation/umi @metaplex-foundation/mpl-core
```

For guard-gated draws you also need:

```sh
npm install @mallow-labs/mallow-gumball
```

## Setup

Register the plugin with your UMI instance:

```typescript
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mallowJellybean } from '@mallow-labs/mallow-jellybean-umi';

const umi = createUmi('https://api.mainnet-beta.solana.com').use(mallowJellybean());
```

## Quick Start

The full lifecycle of a jellybean machine — from creation to withdrawal:

```typescript
import { generateSigner, sol, some } from '@metaplex-foundation/umi';
import { createAsset, createCollection } from '@metaplex-foundation/mpl-core';
import { drawJellybean, findGumballGuardPda, wrap, createGumballGuard } from '@mallow-labs/mallow-gumball';
import {
  createJellybeanMachine,
  addCoreItem,
  startSale,
  endSale,
  claimCoreItem,
  withdraw,
  fetchJellybeanMachineWithItems,
  fetchUnclaimedPrizesFromSeeds,
} from '@mallow-labs/mallow-jellybean-umi';

// 1. Create the machine
const jellybeanMachineSigner = generateSigner(umi);
const jellybeanMachine = jellybeanMachineSigner.publicKey;

await (
  await createJellybeanMachine(umi, {
    jellybeanMachine: jellybeanMachineSigner,
    args: {
      uri: 'https://example.com/drop-metadata.json',
      feeAccounts: [{ address: umi.identity.publicKey, basisPoints: 10000 }],
    },
  })
).sendAndConfirm(umi);

// 2. Add a limited edition collection (supply of 50)
const collection = generateSigner(umi);
await createCollection(umi, {
  collection,
  name: 'Rare Drop',
  uri: 'https://example.com/collection.json',
  plugins: [
    { type: 'MasterEdition', maxSupply: 50 },
  ],
}).sendAndConfirm(umi);

await addCoreItem(umi, { jellybeanMachine, collection: collection.publicKey }).sendAndConfirm(umi);

// 3. Add a one-of-one asset
const asset = generateSigner(umi);
await createAsset(umi, { asset, name: 'Ultra Rare', uri: 'https://example.com/asset.json' }).sendAndConfirm(umi);
await addCoreItem(umi, { jellybeanMachine, asset: asset.publicKey }).sendAndConfirm(umi);

// 4. Start the sale
await startSale(umi, { jellybeanMachine }).sendAndConfirm(umi);

// 5. Draw (buyer pays 0.1 SOL via gumball guard)
const buyer = generateSigner(umi);
await drawJellybean(umi, {
  jellybeanMachine,
  mintArgs: {
    solPayment: some({ feeAccounts: [umi.identity.publicKey] }),
  },
}).sendAndConfirm(umi);

// 6. Claim the prize
const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(umi, {
  jellybeanMachine,
  buyer: buyer.publicKey,
});
const prize = unclaimedPrizes.prizes[0];

const machine = await fetchJellybeanMachineWithItems(umi, jellybeanMachine);
const item = machine.items[prize.itemIndex];

const printAsset = generateSigner(umi); // required for edition claims
await claimCoreItem(umi, {
  jellybeanMachine,
  buyer: buyer.publicKey,
  collection: item.mint,   // pass collection for editions
  printAsset,
  index: prize.itemIndex,
}).sendAndConfirm(umi);

// 7. Withdraw after all items are removed
await withdraw(umi, { jellybeanMachine }).sendAndConfirm(umi);
```

## Creating a Jellybean Machine

Use `createJellybeanMachine`, which combines account allocation and initialization into a single builder.

```typescript
import { generateSigner } from '@metaplex-foundation/umi';
import { createJellybeanMachine } from '@mallow-labs/mallow-jellybean-umi';

const jellybeanMachineSigner = generateSigner(umi);

await (
  await createJellybeanMachine(umi, {
    jellybeanMachine: jellybeanMachineSigner,
    // Optional: set a different authority than umi.identity
    authority: someAuthority,
    args: {
      uri: 'https://example.com/machine-metadata.json',
      feeAccounts: [
        { address: marketplaceFeeWallet, basisPoints: 500 },  // 5% marketplace fee
        { address: creatorWallet, basisPoints: 9500 },         // 95% to creator
      ],
      // Optional: extra fee per edition print
      printFeeConfig: {
        address: printFeeWallet,
        amount: 5_000_000n, // 0.005 SOL per print
      },
    },
  })
).sendAndConfirm(umi);
```

**Fee account rules:**
- All `basisPoints` values must sum to exactly `10000` (100%).
- Maximum of 6 fee accounts.
- An empty `feeAccounts` array is allowed (no fee distribution).

**URI:** Maximum 196 characters. Should point to JSON off-chain metadata describing the drop.

## Adding Items

### One-of-one Core asset

The asset is transferred into the machine's authority PDA escrow. Only pass `asset`:

```typescript
import { addCoreItem } from '@mallow-labs/mallow-jellybean-umi';

await addCoreItem(umi, {
  jellybeanMachine: jellybeanMachine,
  asset: assetPublicKey,
}).sendAndConfirm(umi);
```

### Limited edition collection

Pass the `collection` address. The collection must have the `MasterEdition` plugin with a defined `max_supply` and zero existing prints. The program will escrow SOL for each edition slot to cover the on-demand print creation cost (rent + Metaplex fee). This escrow is refunded to the payer when each edition is claimed.

```typescript
await addCoreItem(umi, {
  jellybeanMachine: jellybeanMachine,
  collection: collectionPublicKey,
}).sendAndConfirm(umi);
```

**Requirements for master editions:**
- Collection must have a `MasterEdition` plugin with a non-null `maxSupply`.
- `currentSize` must be `0` — no prints can exist yet.
- The payer must have enough SOL to cover the escrow for all edition slots.

You can add up to 255 distinct items (each may be one-of-one or an edition). Items can be added in batches of up to ~8 per transaction.

## Starting and Ending the Sale

```typescript
import { startSale, endSale } from '@mallow-labs/mallow-jellybean-umi';

// Transition from None → SaleLive
await startSale(umi, { jellybeanMachine }).sendAndConfirm(umi);

// Manually end the sale (SaleLive → SaleEnded)
// Note: the sale also ends automatically when the last item is drawn.
await endSale(umi, { jellybeanMachine }).sendAndConfirm(umi);
```

## Drawing

Draws are typically made through the **Gumball Guard** program, which enforces payment and access control (allow lists, start/end dates, bot tax, etc.). Use `drawJellybean` from `@mallow-labs/mallow-gumball`:

```typescript
import { drawJellybean, findGumballGuardPda, wrap, createGumballGuard } from '@mallow-labs/mallow-gumball';
import { some, sol } from '@metaplex-foundation/umi';

// First, create and attach a guard (once, during setup):
const base = jellybeanMachineSigner; // reuse the machine keypair as base
await createGumballGuard(umi, {
  base,
  guards: {
    solPayment: { lamports: sol(0.1) },
  },
}).sendAndConfirm(umi);

const gumballGuard = findGumballGuardPda(umi, { base: jellybeanMachine });
await wrap(umi, {
  machine: jellybeanMachine,
  gumballGuard,
  machineProgram: umi.programs.get('mallowJellybean').publicKey,
}).sendAndConfirm(umi);

// Then buyers draw through the guard:
await drawJellybean(umi, {
  jellybeanMachine,
  mintArgs: {
    solPayment: some({ feeAccounts: [creatorWallet, marketplaceWallet] }),
  },
}).sendAndConfirm(umi);
```

**Multiple draws in one transaction** (batching):

```typescript
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import { transactionBuilder } from '@metaplex-foundation/umi';

await transactionBuilder()
  .add(setComputeUnitLimit(umi, { units: 1_400_000 }))
  .add(drawJellybean(umi, { jellybeanMachine, mintArgs: { solPayment: some({ feeAccounts: [creatorWallet] }) } }))
  .add(drawJellybean(umi, { jellybeanMachine, mintArgs: { solPayment: some({ feeAccounts: [creatorWallet] }) } }))
  .add(drawJellybean(umi, { jellybeanMachine, mintArgs: { solPayment: some({ feeAccounts: [creatorWallet] }) } }))
  .sendAndConfirm(umi);
```

**Direct draw (no guard)** — only the `mint_authority` may call this:

```typescript
import { draw } from '@mallow-labs/mallow-jellybean-umi';

await draw(umi, {
  jellybeanMachine,
  buyer: buyerPublicKey,
}).sendAndConfirm(umi);
```

## Claiming Prizes

After a draw, the prize is stored in the buyer's `UnclaimedPrizes` account. Anyone can pay for and submit a claim on behalf of the buyer.

### Fetching unclaimed prizes

```typescript
import { fetchUnclaimedPrizesFromSeeds, fetchJellybeanMachineWithItems } from '@mallow-labs/mallow-jellybean-umi';

const unclaimedPrizes = await fetchUnclaimedPrizesFromSeeds(umi, {
  jellybeanMachine,
  buyer: buyerPublicKey,
});
// unclaimedPrizes.prizes: Array<{ itemIndex: number, editionNumber: number }>

const machine = await fetchJellybeanMachineWithItems(umi, jellybeanMachine);
// machine.items: Array<{ index, mint, supplyLoaded, supplyRedeemed, supplyClaimed, escrowAmount }>
```

### Claiming a one-of-one asset

Pass the `asset` address. The asset is transferred directly to the buyer:

```typescript
import { claimCoreItem } from '@mallow-labs/mallow-jellybean-umi';

await claimCoreItem(umi, {
  jellybeanMachine,
  buyer: buyerPublicKey,
  asset: item.mint,
  index: prize.itemIndex,
}).sendAndConfirm(umi);
```

### Claiming a limited edition print

Pass the `collection` address and a **new** `printAsset` signer. The program creates a new Core asset (the numbered print) in the buyer's wallet and returns the escrowed SOL to the payer:

```typescript
const printAsset = generateSigner(umi); // fresh keypair for the new print NFT

await claimCoreItem(umi, {
  jellybeanMachine,
  buyer: buyerPublicKey,
  collection: item.mint,  // master edition collection
  printAsset,             // signer for the new print
  index: prize.itemIndex,
}).sendAndConfirm(umi);
```

The minted print will have an `Edition` plugin with the edition number assigned at draw time (e.g. Edition #7 of 50).

## Fetching Machine Data

```typescript
import {
  fetchJellybeanMachine,
  fetchJellybeanMachineWithItems,
  safeFetchJellybeanMachineWithItems,
} from '@mallow-labs/mallow-jellybean-umi';

// Base account data only (faster, no item deserialization)
const machine = await fetchJellybeanMachine(umi, jellybeanMachinePublicKey);
console.log(machine.state);          // JellybeanState.SaleLive
console.log(machine.supplyLoaded);   // 150n
console.log(machine.supplyRedeemed); // 42n

// Full account data including all loaded items
const machineWithItems = await fetchJellybeanMachineWithItems(umi, jellybeanMachinePublicKey);
for (const item of machineWithItems.items) {
  console.log(item.index, item.mint, item.supplyLoaded, item.supplyRedeemed);
}

// Null-safe variant (returns null if account doesn't exist)
const maybeNull = await safeFetchJellybeanMachineWithItems(umi, jellybeanMachinePublicKey);
```

## Updating Settings

Settings can be updated before the sale ends. The number of fee accounts cannot change after initialization.

```typescript
import { updateSettings } from '@mallow-labs/mallow-jellybean-umi';

await updateSettings(umi, {
  jellybeanMachine,
  args: {
    uri: 'https://example.com/updated-metadata.json',
    feeAccounts: [{ address: umi.identity.publicKey, basisPoints: 10000 }],
  },
}).sendAndConfirm(umi);
```

## Changing Mint Authority

```typescript
import { setMintAuthority } from '@mallow-labs/mallow-jellybean-umi';

// Both current authority and new mint authority must sign
await setMintAuthority(umi, {
  jellybeanMachine,
  mintAuthority: newMintAuthoritySigner,
}).sendAndConfirm(umi);
```

## Removing Items

Items can be removed before the sale (`None` state) or after it ends (`SaleEnded` state). An item can only be removed if all of its drawn copies have been claimed.

```typescript
import { removeCoreItem } from '@mallow-labs/mallow-jellybean-umi';

await removeCoreItem(umi, {
  jellybeanMachine,
  collection: collectionPublicKey, // or asset: assetPublicKey
  index: 0,
}).sendAndConfirm(umi);
```

## Closing the Machine

After the sale ends and all items are removed (`items_loaded == 0`), close the machine to reclaim rent:

```typescript
import { withdraw } from '@mallow-labs/mallow-jellybean-umi';

// Closes the jellybean machine account and returns rent to the authority
await withdraw(umi, { jellybeanMachine }).sendAndConfirm(umi);
```

If you also attached a Gumball Guard, delete it separately using `closeJellybeanMachine`, which removes the guard:

```typescript
import { closeJellybeanMachine } from '@mallow-labs/mallow-jellybean-umi';

// Deletes the attached Gumball Guard (does not close the machine account)
await closeJellybeanMachine(umi, { jellybeanMachine }).sendAndConfirm(umi);
```

## Types Reference

| Type | Description |
|---|---|
| `JellybeanMachine` | Deserialized base account data |
| `JellybeanMachineWithItems` | Account data including all loaded items |
| `JellybeanMachineItem` | Per-item data (`index`, `mint`, `supplyLoaded`, `supplyRedeemed`, `supplyClaimed`, `escrowAmount`) |
| `UnclaimedPrizes` | Buyer's draw history (`prizes: Prize[]`) |
| `Prize` | Single draw result (`itemIndex: number`, `editionNumber: number`) |
| `FeeAccount` | Fee recipient (`address: PublicKey`, `basisPoints: number`) |
| `PrintFeeConfig` | Per-print fee config (`address: PublicKey`, `amount: bigint`) |
| `JellybeanState` | Enum: `None \| SaleLive \| SaleEnded` |
| `SettingsArgs` | Arguments for `initialize` and `updateSettings` |

## Running Tests

```sh
# From the repository root
pnpm clients:umi:test

# Or from this directory
pnpm build
pnpm test
```
