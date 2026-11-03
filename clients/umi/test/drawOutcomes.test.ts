import { drawJellybean } from '@mallow-labs/mallow-gumball';
import { createAccount, transferSol } from '@metaplex-foundation/mpl-toolbox';
import {
  generateSigner,
  lamports,
  PublicKey,
  publicKey,
  Signer,
  some,
  Umi,
} from '@metaplex-foundation/umi';
import test from 'ava';
import {
  fetchJellybeanMachineWithItems,
  fetchUnclaimedPrizesFromSeeds,
  findUnclaimedPrizesPda,
} from '../src';
import {
  create,
  createCoreAsset,
  createMasterEdition,
  createUmi,
  DEFAULT_SOL_PAYMENT_LAMPORTS,
  yesterday,
} from './_setup';

// The draw's seed subtracts the clock, so pinning the clock picks the outcome. A
// machine with N units left reaches every unit within N consecutive seconds, and
// these machines hold at most three. Tests are serial because the pin is process-wide.
const PINNED_SECONDS = [1_800_000_000, 1_800_000_001, 1_800_000_002];
const realNow = Date.now;
const pinClock = (seconds: number) => {
  Date.now = () => seconds * 1000;
};
test.afterEach.always(() => {
  Date.now = realNow;
});

const MPL_CORE_PROGRAM_ID = publicKey(
  'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d'
);
const SYSTEM_PROGRAM_ID = publicKey('11111111111111111111111111111111');
const TX_FEE_LAMPORTS = 5_000n;
// `UnclaimedPrizes::space(1)` in the program.
const UNCLAIMED_PRIZES_SIZE_WITH_ONE_PRIZE = 82;
const PRICE_LAMPORTS = DEFAULT_SOL_PAYMENT_LAMPORTS.basisPoints;

type Mixed = {
  sellerUmi: Umi;
  jellybeanMachine: PublicKey;
  printFeeAccount?: PublicKey;
};

const createMixedMachine = async (
  printFee?: bigint,
  printFeeAddress?: PublicKey
): Promise<Mixed> => {
  const sellerUmi = await createUmi();
  const asset = await createCoreAsset(sellerUmi);
  // Only an edition of more than one pays the print fee.
  const edition = await createMasterEdition(sellerUmi, {
    maxSupply: printFee != null ? 2 : 1,
  });
  const printFeeAccount =
    printFee != null
      ? (printFeeAddress ?? generateSigner(sellerUmi).publicKey)
      : undefined;

  const jellybeanMachine = await create(sellerUmi, {
    args: {
      uri: 'https://example.com',
      feeAccounts: [
        { address: sellerUmi.identity.publicKey, basisPoints: 10000 },
      ],
      printFeeConfig:
        printFee != null
          ? { address: printFeeAccount!, amount: printFee }
          : undefined,
    },
    items: [{ asset: asset.publicKey }, { collection: edition.publicKey }],
    startSale: true,
  });

  return { sellerUmi, jellybeanMachine, printFeeAccount };
};

const draw = (buyerUmi: Umi, machine: Mixed) =>
  drawJellybean(buyerUmi, {
    jellybeanMachine: machine.jellybeanMachine,
    mintArgs: {
      solPayment: some({ feeAccounts: [machine.sellerUmi.identity.publicKey] }),
    },
    printFeeAccount: machine.printFeeAccount,
  });

const fundedBuyer = async (umi: Umi, amount: bigint) => {
  const buyer = generateSigner(umi);
  await umi.rpc.airdrop(buyer.publicKey, lamports(amount));
  return { buyer, buyerUmi: await createUmi(buyer) };
};

/** The rent a first draw pays, and the rent floor of a wallet. */
const getRents = async (umi: Umi) => ({
  prizes: (await umi.rpc.getRent(UNCLAIMED_PRIZES_SIZE_WITH_ONE_PRIZE))
    .basisPoints,
  floor: (await umi.rpc.getRent(0)).basisPoints,
});

const getEscrow = async (machine: Mixed) => {
  const { items } = await fetchJellybeanMachineWithItems(
    machine.sellerUmi,
    machine.jellybeanMachine
  );
  return BigInt(items[1].escrowAmount);
};

const getDrawnItem = async (
  umi: Umi,
  jellybeanMachine: PublicKey,
  buyer: Signer
) =>
  (
    await fetchUnclaimedPrizesFromSeeds(umi, {
      jellybeanMachine,
      buyer: buyer.publicKey,
    })
  ).prizes[0].itemIndex;

test.serial('the pinned clock reaches both outcomes', async (t) => {
  const drawn = new Set<number>();
  for (const seconds of PINNED_SECONDS) {
    pinClock(seconds);
    const machine = await createMixedMachine();
    const { buyer, buyerUmi } = await fundedBuyer(
      machine.sellerUmi,
      1_000_000_000n
    );
    await draw(buyerUmi, machine).sendAndConfirm(buyerUmi);
    drawn.add(
      await getDrawnItem(machine.sellerUmi, machine.jellybeanMachine, buyer)
    );
  }
  t.deepEqual([...drawn].sort(), [0, 1]);
});

test.serial(
  'a payer one lamport short of the worst case fails on every outcome',
  async (t) => {
    for (const seconds of PINNED_SECONDS) {
      pinClock(seconds);
      const machine = await createMixedMachine();
      const { prizes, floor } = await getRents(machine.sellerUmi);
      const escrow = await getEscrow(machine);
      const { buyerUmi } = await fundedBuyer(
        machine.sellerUmi,
        TX_FEE_LAMPORTS + PRICE_LAMPORTS + prizes + escrow + floor - 1n
      );

      await t.throwsAsync(() => draw(buyerUmi, machine).sendAndConfirm(buyerUmi), {
        message: /InsufficientFunds/,
      });
    }
  }
);

test.serial(
  'a payer holding exactly the worst case succeeds on every outcome',
  async (t) => {
    const leftovers = new Set<bigint>();
    for (const seconds of PINNED_SECONDS) {
      pinClock(seconds);
      const machine = await createMixedMachine();
      const { prizes, floor } = await getRents(machine.sellerUmi);
      const escrow = await getEscrow(machine);
      const { buyer, buyerUmi } = await fundedBuyer(
        machine.sellerUmi,
        TX_FEE_LAMPORTS + PRICE_LAMPORTS + prizes + escrow + floor
      );

      await draw(buyerUmi, machine).sendAndConfirm(buyerUmi);

      const item = await getDrawnItem(
        machine.sellerUmi,
        machine.jellybeanMachine,
        buyer
      );
      const left = (await machine.sellerUmi.rpc.getBalance(buyer.publicKey))
        .basisPoints;
      // Only the edition charges the escrow; the one-of-one leaves it with the buyer.
      t.is(left, item === 1 ? floor : floor + escrow);
      leftovers.add(left);
    }
    t.is(leftovers.size, 2);
  }
);

test.serial('the print fee counts towards the worst case', async (t) => {
  const printFee = 11_000_000n;
  for (const seconds of PINNED_SECONDS) {
    pinClock(seconds);
    const machine = await createMixedMachine(printFee);
    const { prizes, floor } = await getRents(machine.sellerUmi);
    const escrow = await getEscrow(machine);
    const { buyerUmi } = await fundedBuyer(
      machine.sellerUmi,
      // Enough for the escrow, not for the escrow and the print fee.
      TX_FEE_LAMPORTS + PRICE_LAMPORTS + prizes + escrow + printFee + floor - 1n
    );

    await t.throwsAsync(() => draw(buyerUmi, machine).sendAndConfirm(buyerUmi), {
      message: /InsufficientFunds/,
    });
  }
});

test.serial(
  'a missing or wrong print fee account fails on every outcome',
  async (t) => {
    for (const seconds of PINNED_SECONDS) {
      pinClock(seconds);
      for (const printFeeAccount of [undefined, 'wrong'] as const) {
        const machine = await createMixedMachine(11_000_000n);
        const { buyer, buyerUmi } = await fundedBuyer(
          machine.sellerUmi,
          1_000_000_000n
        );

        const error = await t.throwsAsync(() =>
          draw(buyerUmi, {
            ...machine,
            printFeeAccount:
              printFeeAccount === 'wrong' ? buyer.publicKey : undefined,
          }).sendAndConfirm(buyerUmi)
        );
        t.regex(error!.message, /PublicKeyMismatch/);
      }
    }
  }
);

test.serial(
  'a print fee that leaves its account below the rent floor fails on every outcome',
  async (t) => {
    for (const seconds of PINNED_SECONDS) {
      pinClock(seconds);
      // An empty account the fee does not make rent-exempt.
      const machine = await createMixedMachine(1_000n);
      const { buyerUmi } = await fundedBuyer(machine.sellerUmi, 1_000_000_000n);

      await t.throwsAsync(() => draw(buyerUmi, machine).sendAndConfirm(buyerUmi), {
        message: /InvalidPrintFeeAccount/,
      });
    }
  }
);

test.serial(
  'a print fee sent to an executable account fails on every outcome',
  async (t) => {
    for (const seconds of PINNED_SECONDS) {
      pinClock(seconds);
      const machine = await createMixedMachine(11_000_000n, MPL_CORE_PROGRAM_ID);
      const { buyerUmi } = await fundedBuyer(machine.sellerUmi, 1_000_000_000n);

      await t.throwsAsync(() => draw(buyerUmi, machine).sendAndConfirm(buyerUmi), {
        message: /InvalidPrintFeeAccount/,
      });
    }
  }
);

for (const [name, space, programId] of [
  ['carries data', 8, SYSTEM_PROGRAM_ID],
  ['belongs to another program', 0, MPL_CORE_PROGRAM_ID],
] as const) {
  test.serial(`a payer that ${name} fails on every outcome`, async (t) => {
    for (const seconds of PINNED_SECONDS) {
      pinClock(seconds);
      const sellerUmi = await createUmi();
      const asset = await createCoreAsset(sellerUmi);
      const edition = await createMasterEdition(sellerUmi, { maxSupply: 1 });
      // No SOL price, so the item charges are this payer's only system debits.
      const jellybeanMachine = await create(sellerUmi, {
        items: [{ asset: asset.publicKey }, { collection: edition.publicKey }],
        guards: { startDate: { date: yesterday() } },
        startSale: true,
      });

      // The payer can sign, but `Transfer` refuses to debit it. Funding the prize
      // account up front spares it every debit that a one-of-one would need.
      const payer = generateSigner(sellerUmi);
      const feePayer = generateSigner(sellerUmi);
      await sellerUmi.rpc.airdrop(feePayer.publicKey, lamports(1_000_000_000n));
      await createAccount(sellerUmi, {
        newAccount: payer,
        lamports: lamports(1_000_000_000n),
        space,
        programId,
      }).sendAndConfirm(sellerUmi);
      const [unclaimedPrizes] = findUnclaimedPrizesPda(sellerUmi, {
        jellybeanMachine,
        buyer: payer.publicKey,
      });
      const { prizes } = await getRents(sellerUmi);
      await sellerUmi.rpc.airdrop(unclaimedPrizes, lamports(prizes));

      const payerUmi = await createUmi(payer);
      await t.throwsAsync(
        () =>
          drawJellybean(payerUmi, { jellybeanMachine })
            .setFeePayer(feePayer)
            .sendAndConfirm(payerUmi),
        { message: /InvalidPayer/ }
      );
    }
  });
}

test.serial(
  'a print fee that covers the rent floor of an empty account draws on every outcome',
  async (t) => {
    const drawn = new Set<number>();
    for (const seconds of PINNED_SECONDS) {
      pinClock(seconds);
      const umi = await createUmi();
      const { floor } = await getRents(umi);
      const machine = await createMixedMachine(floor);
      const { buyer, buyerUmi } = await fundedBuyer(
        machine.sellerUmi,
        1_000_000_000n
      );

      await draw(buyerUmi, machine).sendAndConfirm(buyerUmi);

      drawn.add(
        await getDrawnItem(machine.sellerUmi, machine.jellybeanMachine, buyer)
      );
    }
    t.deepEqual([...drawn].sort(), [0, 1]);
  }
);

test.serial(
  'a fee-fronted buyer holding nothing draws on every outcome',
  async (t) => {
    for (const seconds of PINNED_SECONDS) {
      pinClock(seconds);
      const machine = await createMixedMachine();
      const { sellerUmi } = machine;
      const { prizes, floor } = await getRents(sellerUmi);
      const escrow = await getEscrow(machine);

      // buildDrawJellybeanTxs' advance for a buyer with no SOL beyond the price:
      // the rent of what the draw creates, the largest escrow, and the rent floor.
      const auth = generateSigner(sellerUmi);
      await sellerUmi.rpc.airdrop(auth.publicKey, lamports(1_000_000_000n));
      const { buyer, buyerUmi } = await fundedBuyer(sellerUmi, PRICE_LAMPORTS);

      await transferSol(buyerUmi, {
        source: auth,
        destination: buyer.publicKey,
        amount: lamports(prizes + escrow + floor),
      })
        .add(draw(buyerUmi, machine))
        .setFeePayer(auth)
        .sendAndConfirm(buyerUmi);

      const item = await getDrawnItem(
        sellerUmi,
        machine.jellybeanMachine,
        buyer
      );
      const left = (await sellerUmi.rpc.getBalance(buyer.publicKey)).basisPoints;
      t.is(left, item === 1 ? floor : floor + escrow);
    }
  }
);

test.serial(
  'once only one-of-ones remain a draw can spend the whole balance',
  async (t) => {
    for (const seconds of PINNED_SECONDS) {
      pinClock(seconds);
      const machine = await createMixedMachine();
      const { sellerUmi, jellybeanMachine } = machine;
      const rich = await fundedBuyer(sellerUmi, 1_000_000_000n);
      await draw(rich.buyerUmi, machine).sendAndConfirm(rich.buyerUmi);
      const firstItem = await getDrawnItem(
        sellerUmi,
        jellybeanMachine,
        rich.buyer
      );
      if (firstItem !== 1) continue;

      const { prizes } = await getRents(sellerUmi);
      const { buyer, buyerUmi } = await fundedBuyer(
        sellerUmi,
        TX_FEE_LAMPORTS + PRICE_LAMPORTS + prizes
      );

      await draw(buyerUmi, machine).sendAndConfirm(buyerUmi);

      t.is((await sellerUmi.rpc.getBalance(buyer.publicKey)).basisPoints, 0n);
    }
    t.pass();
  }
);
