import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor as renderJavaScriptVisitor } from "@codama/renderers-js-umi";
import { renderVisitor as renderRustVisitor } from "@codama/renderers-rust";
import * as c from "codama";
import { readFileSync } from "fs";
import path from "path";

// Paths.
const clientDir = "./clients";
const idlDir = "./idls";
const idl = JSON.parse(readFileSync(path.join(idlDir, "mallow_jellybean.json")));

// Instantiate Codama.
const codama = c.createFromRoot(rootNodeFromAnchor(idl));

// Update programs.
codama.update(
	new c.updateProgramsVisitor({
		mallowJellybeanProgram: { name: "mallowJellybean" },
	}),
);

// Update accounts.
codama.update(
	new c.updateAccountsVisitor({
		airdropConfig: {
			seeds: [
				c.constantPdaSeedNodeFromString("utf8", "airdrop"),
				c.constantPdaSeedNode(c.publicKeyTypeNode(), c.programIdValueNode()),
				c.variablePdaSeedNode(
					"masterAsset",
					c.publicKeyTypeNode(),
					"The master edition Legacy mint or Core Collection being printed from",
				),
			],
		},
		claimAccount: {
			seeds: [
				c.constantPdaSeedNodeFromString("utf8", "claim"),
				c.constantPdaSeedNode(c.publicKeyTypeNode(), c.programIdValueNode()),
				c.variablePdaSeedNode(
					"airdropConfig",
					c.publicKeyTypeNode(),
					"The airdrop configuration being claimed from",
				),
				c.variablePdaSeedNode("recipient", c.publicKeyTypeNode(), "The recipient for this claim"),
			],
		},
	}),
);

codama.update(
	new c.setInstructionAccountDefaultValuesVisitor([
		{
			account: "creator",
			defaultValue: c.identityValueNode(),
		},
		{
			account: "airdropConfig",
			defaultValue: c.pdaValueNode("airdropConfig"),
		},
		{
			account: "feeRecipient",
			defaultValue: c.publicKeyValueNode("MFHHByMGfk84s3GZ8dZHaQQ3gbpQYc2NnQYPg2tRCSx"),
		},
		{
			account: "tokenAccount",
			defaultValue: c.resolverValueNode("resolveOptionalTokenAccount"),
		},
		{
			account: "tmpTokenAccount",
			defaultValue: c.resolverValueNode("resolveOptionalTmpTokenAccount"),
		},
		{
			account: "metadata",
			defaultValue: c.resolverValueNode("resolveOptionalMetadata"),
		},
		{
			account: "edition",
			defaultValue: c.resolverValueNode("resolveOptionalEdition"),
		},
		{
			account: "delegateRecord",
			defaultValue: c.resolverValueNode("resolveOptionalDelegateRecord"),
		},
		{
			account: "tokenProgram",
			defaultValue: c.resolverValueNode("resolveOptionalTokenProgram"),
		},
		{
			account: "associatedTokenProgram",
			defaultValue: c.resolverValueNode("resolveOptionalAssociatedTokenProgram"),
		},
		{
			account: "sysvarInstructions",
			defaultValue: c.resolverValueNode("resolveOptionalSysvarInstructions"),
		},
		{
			account: "printTokenAccount",
			defaultValue: c.resolverValueNode("resolveOptionalPrintTokenAccount"),
		},
		{
			account: "printMetadata",
			defaultValue: c.resolverValueNode("resolveOptionalPrintMetadata"),
		},
		{
			account: "printEdition",
			defaultValue: c.resolverValueNode("resolveOptionalPrintEdition"),
		},
	]),
);

const claimAccountValueNode = (airdropConfig = "airdropConfig", recipient = "recipient") =>
	c.pdaValueNode("claimAccount", [
		c.pdaSeedValueNode("airdropConfig", c.accountValueNode(airdropConfig)),
		c.pdaSeedValueNode("recipient", c.accountValueNode(recipient)),
	]);

// Update instructions.
codama.update(
	new c.updateInstructionsVisitor({
		initAirdrop: {
			byteDeltas: [c.instructionByteDeltaNode(c.accountLinkNode("airdropConfig"))],
		},
		printEdition: {
			name: "basePrintEdition",
			byteDeltas: [c.instructionByteDeltaNode(c.accountLinkNode("claimAccount"))],
			accounts: {
				claimAccount: {
					defaultValue: claimAccountValueNode(),
				},
			},
		},
		closeAirdrop: {
			byteDeltas: [c.instructionByteDeltaNode(c.accountLinkNode("airdropConfig"))],
			accounts: {
				rentRecipient: {
					defaultValue: c.accountValueNode("creator"),
				},
			},
			arguments: {
				unused: {
					type: c.optionTypeNode(c.booleanTypeNode()),
					defaultValue: c.booleanValueNode(false),
					docs: "Forcing CloseAirdropInstructionExtraArgs to be rendered to fix a bug where resolvedArgs is using an undefined type",
				},
			},
		},
		closeClaimAccount: {
			byteDeltas: [c.instructionByteDeltaNode(c.accountLinkNode("claimAccount"))],
		},
	}),
);

// Set ShankAccount discriminator.
const key = (name) => ({ field: "key", value: c.enumValueNode("Key", name) });
codama.update(
	new c.setAccountDiscriminatorFromFieldVisitor({
		airdropConfig: key("AirdropConfig"),
		claimAccount: key("ClaimAccount"),
	}),
);

// Render JavaScript.
const jsDir = path.join(clientDir, "js", "src", "generated");
const prettier = JSON.parse(readFileSync(path.join(clientDir, "js", ".prettierrc.json")));
codama.accept(
	renderJavaScriptVisitor(jsDir, {
		prettier,
	}),
);

// Render Rust.
const crateDir = path.join(clientDir, "rust");
const rustDir = path.join(clientDir, "rust", "src", "generated");
codama.accept(
	renderRustVisitor(rustDir, {
		formatCode: true,
		crateFolder: crateDir,
	}),
);
