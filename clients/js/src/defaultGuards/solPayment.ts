import { PublicKey } from '@metaplex-foundation/umi';
import {
  getSolPaymentSerializer,
  SolPayment,
  SolPaymentArgs,
} from '../generated';
import { GuardManifest, noopParser } from '../guards';
import { findGumballMachineAuthorityPda } from '../hooked';

/**
 * The solPayment guard is used to charge an
 * amount in SOL for the minted NFT.
 */
export const solPaymentGuardManifest: GuardManifest<
  SolPaymentArgs,
  SolPayment,
  SolPaymentMintArgs
> = {
  name: 'solPayment',
  serializer: getSolPaymentSerializer,
  mintParser: (context, mintContext, args) => ({
    data: new Uint8Array(),
    remainingAccounts: [
      {
        publicKey: findGumballMachineAuthorityPda(context, {
          gumballMachine: mintContext.gumballMachine,
        })[0],
        isWritable: true,
      },
      ...(args.feeAccount
        ? [
            {
              publicKey: args.feeAccount,
              isWritable: true,
            },
          ]
        : []),
    ],
  }),
  routeParser: noopParser,
};

export type SolPaymentMintArgs = {
  feeAccount?: PublicKey;
};
