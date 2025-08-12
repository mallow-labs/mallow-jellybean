import {
  drawJellybean,
  getMerkleProof,
  getMerkleRoot,
  route,
} from '@mallow-labs/mallow-gumball';
import { some, transactionBuilder } from '@metaplex-foundation/umi';
import { generateSignerWithSol } from '@metaplex-foundation/umi-bundle-tests';
import test from 'ava';
import { fetchJellybeanMachine } from '../../src';
import { create, createCoreAsset, createUmi } from '../_setup';

test('it allows allow-listed user to draw', async (t) => {
  const sellerUmi = await createUmi();
  const buyer = await generateSignerWithSol(sellerUmi);
  const buyerUmi = await createUmi(buyer);
  const allowList = [
    buyerUmi.identity.publicKey,
    'Ur1CbWSGsXCdedknRbJsEk7urwAvu1uddmQv51nAnXB',
    'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS',
    '2vjCrmEFiN9CLLhiqy8u1JPh48av8Zpzp3kNkdTtirYG',
    'AT8nPwujHAD14cLojTcB1qdBzA1VXnT6LVGuUd6Y73Cy',
  ];
  const merkleRoot = getMerkleRoot(allowList);

  const assetSigner = await createCoreAsset(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
    guards: {
      allowList: some({ merkleRoot }),
    },
  });

  // When we verify the payer first by providing a valid merkle proof.
  await transactionBuilder()
    .add(
      route(buyerUmi, {
        machine: jellybeanMachine,
        guard: 'allowList',
        routeArgs: {
          path: 'proof',
          merkleRoot,
          merkleProof: getMerkleProof(allowList, buyerUmi.identity.publicKey),
        },
      })
    )
    .add(
      drawJellybean(buyerUmi, {
        jellybeanMachine,
        mintArgs: { allowList: some({ merkleRoot }) },
      })
    )
    .sendAndConfirm(buyerUmi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    sellerUmi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.supplyRedeemed, 1n);
});

test('it allows allow-listed user to draw with a different payer', async (t) => {
  const sellerUmi = await createUmi();
  const buyer = await generateSignerWithSol(sellerUmi);
  const payerUmi = await createUmi();
  const allowList = [
    buyer.publicKey,
    'Ur1CbWSGsXCdedknRbJsEk7urwAvu1uddmQv51nAnXB',
    'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS',
    '2vjCrmEFiN9CLLhiqy8u1JPh48av8Zpzp3kNkdTtirYG',
    'AT8nPwujHAD14cLojTcB1qdBzA1VXnT6LVGuUd6Y73Cy',
  ];
  const merkleRoot = getMerkleRoot(allowList);

  const assetSigner = await createCoreAsset(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
    guards: {
      allowList: some({ merkleRoot }),
    },
  });

  // When we verify the payer first by providing a valid merkle proof.
  await transactionBuilder()
    .add(
      route(payerUmi, {
        machine: jellybeanMachine,
        guard: 'allowList',
        routeArgs: {
          path: 'proof',
          merkleRoot,
          merkleProof: getMerkleProof(allowList, buyer.publicKey),
          buyer: buyer.publicKey,
        },
      })
    )
    .add(
      drawJellybean(payerUmi, {
        buyer,
        jellybeanMachine,
        mintArgs: { allowList: some({ merkleRoot }) },
      })
    )
    .sendAndConfirm(payerUmi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    sellerUmi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.supplyRedeemed, 1n);
});

test('it allows allow-listed user to draw with a different payer using guard group', async (t) => {
  const sellerUmi = await createUmi();
  const buyer = await generateSignerWithSol(sellerUmi);
  const payerUmi = await createUmi();
  const allowList = [
    buyer.publicKey,
    'Ur1CbWSGsXCdedknRbJsEk7urwAvu1uddmQv51nAnXB',
    'GjwcWFQYzemBtpUoN5fMAP2FZviTtMRWCmrppGuTthJS',
    '2vjCrmEFiN9CLLhiqy8u1JPh48av8Zpzp3kNkdTtirYG',
    'AT8nPwujHAD14cLojTcB1qdBzA1VXnT6LVGuUd6Y73Cy',
  ];
  const merkleRoot = getMerkleRoot(allowList);

  const assetSigner = await createCoreAsset(sellerUmi);

  const jellybeanMachine = await create(sellerUmi, {
    items: [
      {
        asset: assetSigner.publicKey,
      },
    ],
    startSale: true,
    groups: [
      {
        label: '0',
        guards: { allowList: some({ merkleRoot }) },
      },
    ],
  });

  // When we verify the payer first by providing a valid merkle proof.
  await transactionBuilder()
    .add(
      route(payerUmi, {
        machine: jellybeanMachine,
        guard: 'allowList',
        routeArgs: {
          path: 'proof',
          merkleRoot,
          merkleProof: getMerkleProof(allowList, buyer.publicKey),
          buyer: buyer.publicKey,
        },
        group: '0',
      })
    )
    .add(
      drawJellybean(payerUmi, {
        buyer,
        jellybeanMachine,
        mintArgs: { allowList: some({ merkleRoot }) },
        group: '0',
      })
    )
    .sendAndConfirm(payerUmi);

  const jellybeanMachineAccount = await fetchJellybeanMachine(
    sellerUmi,
    jellybeanMachine
  );
  t.is(jellybeanMachineAccount.supplyRedeemed, 1n);
});
