/* eslint-disable no-await-in-loop */
import { transactionBuilder } from '@metaplex-foundation/umi';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import test from 'ava';
import {
  fetchGumballMachine,
  getDefaultBuyBackConfig,
  GumballMachine,
  manageBuyBackFunds,
} from '../src';
import { create, createUmi } from './_setup';

test('it can deposit buy back funds', async (t) => {
  // Given an existing gumball machine with buyback enabled
  const umi = await createUmi();

  const gumballMachine = await create(umi, {
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      enabled: true,
    },
  });

  // When we deposit funds
  const depositAmount = 1 * LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // Then we expect the gumball machine account to have the right data.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );
  t.like(gumballMachineAccount, <GumballMachine>{
    buyBackFundsAvailable: BigInt(depositAmount),
  });
});

test('it can withdraw all buy back funds', async (t) => {
  // Given an existing gumball machine with buyback enabled and funds
  const umi = await createUmi();

  const gumballMachine = await create(umi, {
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      enabled: true,
    },
  });

  // Deposit funds first
  const depositAmount = 1 * LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // When we withdraw all funds
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: depositAmount,
        isWithdraw: true,
      })
    )
    .sendAndConfirm(umi);

  // Then we expect the gumball machine account to have the right data.
  const gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );
  t.like(gumballMachineAccount, <GumballMachine>{
    buyBackFundsAvailable: 0n,
  });
});

test('it can withdraw partial buy back funds', async (t) => {
  // Given an existing gumball machine with buyback enabled and funds
  const umi = await createUmi();

  const gumballMachine = await create(umi, {
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      enabled: true,
    },
  });

  // Deposit funds first
  const depositAmount = 2 * LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // When we withdraw partial funds
  const withdrawAmount = 1 * LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: withdrawAmount,
        isWithdraw: true,
      })
    )
    .sendAndConfirm(umi);

  // Then we expect the gumball machine account to have the right data.
  let gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );
  t.like(gumballMachineAccount, <GumballMachine>{
    buyBackFundsAvailable: BigInt(depositAmount - withdrawAmount),
  });

  // When we withdraw partial funds
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: withdrawAmount,
        isWithdraw: true,
      })
    )
    .sendAndConfirm(umi);

  gumballMachineAccount = await fetchGumballMachine(
    umi,
    gumballMachine.publicKey
  );
  t.like(gumballMachineAccount, <GumballMachine>{
    buyBackFundsAvailable: 0n,
  });
});

test('it cannot withdraw more than the available buy back funds available', async (t) => {
  // Given an existing gumball machine with buyback enabled and funds
  const umi = await createUmi();

  const gumballMachine = await create(umi, {
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      enabled: true,
    },
  });

  // Deposit funds first
  const depositAmount = 1 * LAMPORTS_PER_SOL;
  await transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: depositAmount,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // When we try to withdraw more funds than available
  const promise = transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: 2 * LAMPORTS_PER_SOL, // More than what we deposited
        isWithdraw: true,
      })
    )
    .sendAndConfirm(umi);

  // Then the transaction fails
  await t.throwsAsync(promise, { message: /InsufficientFunds/ });
});

test('it cannot deposit buy back funds when buy back setting is disabled', async (t) => {
  // Given an existing gumball machine with buyback disabled
  const umi = await createUmi();

  const gumballMachine = await create(umi, {
    buyBackConfig: {
      ...getDefaultBuyBackConfig(),
      enabled: false, // Explicitly disabled
    },
  });

  // When we try to deposit funds
  const promise = transactionBuilder()
    .add(
      manageBuyBackFunds(umi, {
        gumballMachine: gumballMachine.publicKey,
        amount: 1 * LAMPORTS_PER_SOL,
        isWithdraw: false,
      })
    )
    .sendAndConfirm(umi);

  // Then the transaction fails
  await t.throwsAsync(promise, { message: /BuyBackNotEnabled/ });
});
