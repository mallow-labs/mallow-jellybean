# JavaScript client for mallow Gumball Machine

A Umi-compatible JavaScript library for Gumball machines.

## Getting started

1. First, if you're not already using Umi, [follow these instructions to install the Umi framework](https://github.com/metaplex-foundation/umi/blob/main/docs/installation.md).
2. Next, install this library using the package manager of your choice.
   ```sh
   npm install @mallow-labs/mallow-gumball
   ```
2. Finally, register the library with your Umi instance like so.
   ```ts
   import { mallowGumball } from '@mallow-labs/mallow-gumball';
   umi.use(mallowGumball());
   ```

Refer to the [tests](https://github.com/mallow-labs/mallow-gumball/blob/main/clients/js/test) to see full examples of how each instruction is used.

## Quick Start Guide

This guide shows a basic end-to-end flow for creating a Gumball Machine, drawing an NFT, claiming it, and settling the sale.

### Setup

First, initialize your Umi instance and ensure the necessary wallets are funded. Register the required Umi plugins (`mplTokenMetadata`, `mplToolbox`, `mallowGumball`) and define the public keys for the authority, the Gumball Machine (using `generateSigner`), and the NFT you want to include.

```ts
import { Umi, publicKey, generateSigner, some } from '@metaplex-foundation/umi';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { mplToolbox } from '@metaplex-foundation/mpl-toolbox';
import { mallowGumball } from '@mallow-labs/mallow-gumball';

// Assuming you have initialized a Umi instance and funded the payer/authority wallet
const umi: Umi = // ... initialize your Umi instance
umi.use(mplTokenMetadata());
umi.use(mplToolbox());
umi.use(mallowGumball());

const authority = umi.identity; // The authority creating the Gumball Machine
const gumballMachineSigner = generateSigner(umi); // Generate a keypair for the machine
const gumballMachine = gumballMachineSigner.publicKey;
const nftPublicKey = publicKey('...'); // The public key of the NFT to put in the machine
```

### 1. Create the Gumball Machine

Use the `createGumballMachine` instruction to create the machine on-chain. Specify the authority, the machine's signer, the items to include (NFTs or other tokens), and any guards (like payment requirements or mint limits).

```ts
import { createGumballMachine } from '@mallow-labs/mallow-gumball';
import { publicKey, sol, generateSigner, none } from '@metaplex-foundation/umi'; // Assuming Umi and authority are already defined

const gumballMachineSigner = generateSigner(umi); // Assuming umi is defined

await createGumballMachine(umi, {
  gumballMachine: gumballMachineSigner,
  guards: {
    solPayment: { lamports: sol(1) },
    // Add other guards as needed (botTax, mintLimit, etc.)
  },
  settings: {
   itemCapacity: 100n, // Can add up to 100 prizes
   uri: 'https://example.com/gumball-machine.json', // The metadata for the machine containing name, image (conforms to nft metadata standard)
   itemsPerSeller: 0,
   sellersMerkleRoot: none(),
   curatorFeeBps: 0,
   hideSoldItems: false,
   paymentMint: publicKey('So11111111111111111111111111111111111111112'),
  }
}).sendAndConfirm(umi);
```

### 2. Add an NFT to the Gumball Machine

Use the `addNft` instruction to add a Legacy NFT prize to the Gumball Machine (use `addCoreAsset` or `addTokens` to add other types of prizes).

```ts
import { addNft } from '@mallow-labs/mallow-gumball';

await addNft(umi, {
  gumballMachine,
  mint // The mint address publicKey of the nft
}).sendAndConfirm(umi);
```

### 3. Draw an NFT

A buyer interacts with the machine using the `draw` instruction. They must satisfy the conditions defined by the active guards (e.g., providing SOL payment). The instruction updates the Gumball Machine state to mark the item as drawn by the buyer.

```ts
import { some } from '@metaplex-foundation/umi';
import { draw } from '@mallow-labs/mallow-gumball';

await draw(buyerUmi, {
  gumballMachine,
  mintArgs: {
    solPayment: some(true), // Indicate which payment guard is being used
    // Add other guard arguments if necessary
  },
}).sendAndConfirm(buyerUmi);
```

### 4. Claim the NFT

After successfully drawing, the buyer uses the `claimNft` instruction to receive the NFT in their associated token account. This instruction requires the index of the drawn item, the mint address, and the seller's public key.

```ts
import { claimNft } from '@mallow-labs/mallow-gumball';

await claimNft(buyerUmi, { // Assuming buyerUmi is defined
  gumballMachine,
  index, // Index of the prize being redeemed (check Gumball Machine account for unclaimed items for buyer)
  mint, // Mint address of the item drawn
  seller: authorityPublicKey, // The original seller/authority
}).sendAndConfirm(buyerUmi);
```

### 5. Settle the Sale

The `settleNftSale` instruction finalizes the transaction. It distributes the funds held by the Gumball Machine's authority PDA according to the sale details (e.g., creator royalties, marketplace fees). This can be triggered by the authority, the buyer, or even a third party. It also updates the NFT's metadata if it's the primary sale. Use `settleCoreAssetSale` or `settleTokensSale` for other types of prizes.

```ts
import { settleNftSale } from '@mallow-labs/mallow-gumball';

await settleNftSale(umi, { // Can be called by any Umi instance
  gumballMachine,
  index,
  authority: authorityPublicKey, // The authority of the Gumball Machine
  seller: authorityPublicKey, // The original seller
  buyer: buyerPublicKey, // The buyer who drew the NFT
  mint: nftPublicKey,
  creators: [authorityPublicKey], // List of creator public keys for royalty distribution
}).sendAndConfirm(umi);
```

### 6. Fetch Gumball Machine State

At any point, you can use `fetchGumballMachine` to get the current on-chain state of the machine, including item status, configuration, and counts.

```ts
import { fetchGumballMachine } from '@mallow-labs/mallow-gumball';

const machineState = await fetchGumballMachine(umi, gumballMachine);
```

## Contributing

Check out the [Contributing Guide](./CONTRIBUTING.md) the learn more about how to contribute to this library.
