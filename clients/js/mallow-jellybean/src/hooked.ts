import {
	findHolderDelegateRecordPda,
	findMasterEditionPda,
	findMetadataPda,
	HolderDelegateRole,
	MPL_TOKEN_METADATA_PROGRAM_ID,
} from "@metaplex-foundation/mpl-token-metadata";
import {
	findAssociatedTokenPda,
	SPL_ASSOCIATED_TOKEN_PROGRAM_ID,
	SPL_TOKEN_PROGRAM_ID,
} from "@metaplex-foundation/mpl-toolbox";
import { Context, Pda, publicKey, PublicKey } from "@metaplex-foundation/umi";
import { SYSVAR_INSTRUCTIONS_PUBKEY } from "@solana/web3.js";
import { expectPublicKey, ResolvedAccount } from "./generated";

export const resolveOptionalTokenAccount = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: Pda | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? findAssociatedTokenPda(context, {
					owner: expectPublicKey(accounts.creator.value),
					mint: expectPublicKey(accounts.masterAsset.value),
				})
			: null,
});

export const resolveOptionalTmpTokenAccount = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: Pda | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? findAssociatedTokenPda(context, {
					owner: expectPublicKey(accounts.airdropConfig.value),
					mint: expectPublicKey(accounts.masterAsset.value),
				})
			: null,
});

export const resolveOptionalMetadata = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: Pda | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? findMetadataPda(context, {
					mint: expectPublicKey(accounts.masterAsset.value),
				})
			: null,
});

export const resolveOptionalEdition = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: Pda | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? findMasterEditionPda(context, {
					mint: expectPublicKey(accounts.masterAsset.value),
				})
			: null,
});

export const resolveOptionalDelegateRecord = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: Pda | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? findHolderDelegateRecordPda(context, {
					mint: expectPublicKey(accounts.masterAsset.value),
					delegateRole: HolderDelegateRole.PrintDelegate,
					owner: expectPublicKey(accounts.creator.value),
					delegate: expectPublicKey(accounts.airdropConfig.value),
				})
			: null,
});

export const resolveOptionalTokenProgram = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: PublicKey | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? SPL_TOKEN_PROGRAM_ID
			: null,
});

export const resolveOptionalAssociatedTokenProgram = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: PublicKey | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? SPL_ASSOCIATED_TOKEN_PROGRAM_ID
			: null,
});

export const resolveOptionalSysvarInstructions = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: PublicKey | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? publicKey(SYSVAR_INSTRUCTIONS_PUBKEY)
			: null,
});

export const resolveOptionalPrintTokenAccount = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: Pda | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? findAssociatedTokenPda(context, {
					owner: expectPublicKey(accounts.recipient.value),
					mint: expectPublicKey(accounts.printAsset.value),
				})
			: null,
});

export const resolveOptionalPrintMetadata = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: Pda | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? findMetadataPda(context, {
					mint: expectPublicKey(accounts.printAsset.value),
				})
			: null,
});

export const resolveOptionalPrintEdition = (
	context: Pick<Context, "eddsa" | "programs" | "identity" | "payer">,
	accounts: Record<string, ResolvedAccount>,
	args?: Record<string, unknown>,
	programId?: PublicKey,
	isWritable?: boolean,
): { value: Pda | null } => ({
	value:
		accounts.tokenStandardProgram.value === MPL_TOKEN_METADATA_PROGRAM_ID
			? findMasterEditionPda(context, {
					mint: expectPublicKey(accounts.printAsset.value),
				})
			: null,
});
