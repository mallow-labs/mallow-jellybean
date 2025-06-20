import { MPL_CORE_PROGRAM_ID } from '@metaplex-foundation/mpl-core';
import { MPL_TOKEN_METADATA_PROGRAM_ID } from '@metaplex-foundation/mpl-token-metadata';
import { findAssociatedTokenPda } from '@metaplex-foundation/mpl-toolbox';
import {
  Context,
  publicKey,
  TransactionBuilder,
} from '@metaplex-foundation/umi';
import { sellItemBack, TokenStandard } from './generated';
import { findGumballMachineAuthorityPda } from './hooked';
import { MPL_TOKEN_AUTH_RULES_PROGRAM_ID } from './programs';

export type SellItemInput = Parameters<typeof sellItemBack>[1] & {
  tokenStandard: TokenStandard;
};

export const sellItem = (
  context: Parameters<typeof sellItemBack>[0] & Pick<Context, 'rpc'>,
  input: SellItemInput
): TransactionBuilder => {
  const defaults = getDefaultsForTokenStandard(context, input);
  const feePaymentAccount =
    input.paymentMint != null && input.feeAccount != null
      ? findAssociatedTokenPda(context, {
          mint: publicKey(input.paymentMint),
          owner: publicKey(input.feeAccount),
        })[0]
      : undefined;
  return sellItemBack(context, { ...input, ...defaults, feePaymentAccount });
};

function getDefaultsForTokenStandard(
  context: Parameters<typeof sellItemBack>[0] & Pick<Context, 'rpc'>,
  input: SellItemInput
) {
  const authorityPda = findGumballMachineAuthorityPda(context, {
    gumballMachine: publicKey(input.gumballMachine),
  });

  switch (input.tokenStandard) {
    case TokenStandard.Core:
      return {
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
      };
    case TokenStandard.NonFungible:
      return {
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      };
    case TokenStandard.ProgrammableNonFungible:
      return {
        authRulesProgram: MPL_TOKEN_AUTH_RULES_PROGRAM_ID,
        tokenMetadataProgram: MPL_TOKEN_METADATA_PROGRAM_ID,
      };
    case TokenStandard.Fungible:
      return {
        authorityPdaTokenAccount: findAssociatedTokenPda(context, {
          mint: publicKey(input.mint),
          owner: publicKey(authorityPda),
        })[0],
        sellerTokenAccount: findAssociatedTokenPda(context, {
          mint: publicKey(input.mint),
          owner: publicKey(input.seller ?? context.identity.publicKey),
        })[0],
        buyerTokenAccount: findAssociatedTokenPda(context, {
          mint: publicKey(input.mint),
          owner: publicKey(input.buyer),
        })[0],
      };
    default:
      return {};
  }
}
