const path = require("path");
const k = require("@metaplex-foundation/kinobi");

// Paths.
const clientDir = path.join(__dirname, "..", "clients");
const idlDir = path.join(__dirname, "..", "idls");

// Instanciate Kinobi.
const kinobi = k.createFromIdls([
	path.join(idlDir, "mallow_gumball.json"),
	path.join(idlDir, "gumball_guard.json"),
]);

// Update programs.
kinobi.update(
	new k.UpdateProgramsVisitor({
		gumballGuard: { name: "gumballGuard", prefix: "Cg" },
		gumballMachineCore: { name: "mallowGumball", prefix: "Cm" },
	}),
);

// Transform some defined types into accounts.
kinobi.update(
	new k.TransformDefinedTypesIntoAccountsVisitor([
		"mintCounter",
		"allowListProof",
		"allocationTracker",
	]),
);

// Reusable seeds.
const gumballGuardSeed = k.publicKeySeed(
	"gumballGuard",
	"The address of the Gumball Guard account",
);
const gumballMachineSeed = k.publicKeySeed(
	"gumballMachine",
	"The address of the Gumball Machine account",
);
const userSeed = k.publicKeySeed("user", "The address of the wallet trying to mint");

// Update accounts.
kinobi.update(
	new k.UpdateAccountsVisitor({
		gumballGuard: {
			internal: true,
			seeds: [
				k.stringConstantSeed("gumball_guard"),
				k.publicKeySeed("base", "The base address which the Gumball Guard PDA derives from"),
			],
		},
		sellerHistory: {
			seeds: [
				k.stringConstantSeed("seller_history"),
				gumballMachineSeed,
				k.publicKeySeed("seller", "The seller this history is tracking"),
			],
		},
		addItemRequest: {
			seeds: [
				k.stringConstantSeed("add_item_request"),
				k.publicKeySeed("asset", "The address of the asset being added to the Gumball Machine"),
			],
		},
		mintCounter: {
			size: 2,
			discriminator: k.sizeAccountDiscriminator(),
			seeds: [
				k.stringConstantSeed("mint_limit"),
				k.variableSeed(
					"id",
					k.numberTypeNode("u8"),
					"A unique identifier in the context of a Gumball Machine/Gumball Guard combo",
				),
				userSeed,
				gumballGuardSeed,
				gumballMachineSeed,
			],
		},
		allowListProof: {
			size: 8,
			discriminator: k.sizeAccountDiscriminator(),
			seeds: [
				k.stringConstantSeed("allow_list"),
				k.variableSeed(
					"merkleRoot",
					k.bytesTypeNode(k.fixedSize(32)),
					"The Merkle Root used when verifying the user",
				),
				userSeed,
				gumballGuardSeed,
				gumballMachineSeed,
			],
		},
		freezeEscrow: {
			seeds: [
				k.stringConstantSeed("freeze_escrow"),
				k.publicKeySeed("destination", "The wallet that will eventually receive the funds"),
				gumballGuardSeed,
				gumballMachineSeed,
			],
		},
		allocationTracker: {
			size: 4,
			discriminator: k.sizeAccountDiscriminator(),
			seeds: [
				k.stringConstantSeed("allocation"),
				k.variableSeed("id", k.numberTypeNode("u8"), "Unique identifier of the allocation"),
				gumballGuardSeed,
				gumballMachineSeed,
			],
		},
	}),
);

// Update defined types.
kinobi.update(
	new k.UpdateDefinedTypesVisitor({
		gumballGuardData: { delete: true },
		guardSet: { delete: true },
		group: { delete: true },
	}),
);

// Update fields.
kinobi.update(
	new k.TransformNodesVisitor([
		{
			selector: { type: "structFieldTypeNode", name: "merkleRoot" },
			transformer: (node) => {
				return k.structFieldTypeNode({
					...node,
					child: k.bytesTypeNode(k.fixedSize(32)),
				});
			},
		},
	]),
);

const defaultsToAssociatedTokenPda = (mint = "mint", owner = "owner") =>
	k.pdaDefault("associatedToken", {
		importFrom: "mplEssentials",
		seeds: { mint: k.accountDefault(mint), owner: k.accountDefault(owner) },
	});
const defaultsToSellerHistoryPda = (seller = "seller") =>
	k.pdaDefault("sellerHistory", {
		importFrom: "generated",
		seeds: { seller: k.accountDefault(seller) },
	});
const defaultsToAddItemRequestPda = (asset = "asset") =>
	k.pdaDefault("addItemRequest", {
		importFrom: "generated",
		seeds: { asset: k.accountDefault(asset) },
	});
const defaultsToEventAuthorityPda = () =>
	k.pdaDefault("eventAuthority", {
		importFrom: "hooked",
	});
const defaultsToGumballMachineAuthorityPda = (gumballMachine = "gumballMachine") =>
	k.pdaDefault("gumballMachineAuthority", {
		importFrom: "hooked",
		seeds: { gumballMachine: k.accountDefault(gumballMachine) },
	});
const defaultsToGumballGuardPda = (base = "base") =>
	k.pdaDefault("gumballGuard", {
		importFrom: "hooked",
		seeds: { base: k.accountDefault(base) },
	});
const defaultsToMetadataPda = (mint = "mint") =>
	k.pdaDefault("metadata", {
		importFrom: "mplTokenMetadata",
		seeds: { mint: k.accountDefault(mint) },
	});
const defaultsToMasterEditionPda = (mint = "mint") =>
	k.pdaDefault("masterEdition", {
		importFrom: "mplTokenMetadata",
		seeds: { mint: k.accountDefault(mint) },
	});
const defaultsToTokenRecordPda = (mint = "mint", tokenAccount = "tokenAccount") =>
	k.pdaDefault("tokenRecord", {
		importFrom: "mplTokenMetadata",
		seeds: { mint: k.accountDefault(mint), token: k.accountDefault(tokenAccount) },
	});
const defaultsToSplAssociatedTokenProgram = () =>
	k.programDefault("splAssociatedToken", "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const defaultsToMplCoreProgram = () =>
	k.programDefault("mplCoreProgram", "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
const defaultsToProgram = () =>
	k.programDefault("mallowGumball", "MGUMqztv7MHgoHBYWbvMyL3E3NJ4UHfTwgLJUQAbKGa");
const defaultsToSysvarInstructions = () =>
	k.publicKeyDefault("Sysvar1nstructions1111111111111111111111111");

// Automatically recognize account default values.
kinobi.update(
	new k.SetInstructionAccountDefaultValuesVisitor([
		{
			...k.publicKeyDefault("SysvarS1otHashes111111111111111111111111111"),
			account: /^recentSlothashes$/,
			ignoreIfOptional: true,
		},
		{
			...k.identityDefault(),
			account: "gumballMachineAuthority",
			ignoreIfOptional: true,
		},
		{
			...defaultsToEventAuthorityPda(),
			account: "eventAuthority",
			ignoreIfOptional: true,
		},
		{
			...defaultsToEventAuthorityPda(),
			account: "gumballEventAuthority",
			ignoreIfOptional: true,
		},
		{
			...defaultsToProgram(),
			account: "program",
			ignoreIfOptional: true,
		},
		{
			...defaultsToProgram(),
			account: "gumballMachineProgram",
			ignoreIfOptional: true,
		},
		{
			...k.payerDefault(),
			account: "payer",
			ignoreIfOptional: true,
		},
		{
			...defaultsToSellerHistoryPda(),
			account: "sellerHistory",
			ignoreIfOptional: true,
		},
		{ ...defaultsToAddItemRequestPda(), account: "addItemRequest", ignoreIfOptional: true },
		{
			...k.identityDefault(),
			account: "mintAuthority",
			ignoreIfOptional: true,
		},
		{
			...defaultsToGumballMachineAuthorityPda(),
			account: "authorityPda",
			ignoreIfOptional: true,
		},
		{
			...defaultsToGumballMachineAuthorityPda(),
			account: "gumballMachineAuthorityPda",
			ignoreIfOptional: true,
		},
		{
			...defaultsToMetadataPda("mint"),
			account: "metadata",
			ignoreIfOptional: true,
		},
		{
			...defaultsToMasterEditionPda("mint"),
			account: "edition",
			ignoreIfOptional: true,
		},
		{
			...defaultsToAssociatedTokenPda("mint", "seller"),
			account: "tokenAccount",
			ignoreIfOptional: true,
		},
		{
			...defaultsToAssociatedTokenPda("mint", "buyer"),
			account: "buyerTokenAccount",
			ignoreIfOptional: true,
		},
		{
			...defaultsToAssociatedTokenPda("mint", "authorityPda"),
			account: "authorityPdaTokenAccount",
			ignoreIfOptional: true,
		},
		{
			...defaultsToMplCoreProgram(),
			account: "mplCoreProgram",
			ignoreIfOptional: true,
		},
		{
			...defaultsToSplAssociatedTokenProgram(),
			account: "associatedTokenProgram",
			ignoreIfOptional: true,
		},
	]),
);

const sellerPnftDefault = () => {
	return {
		instructions: {
			defaultsTo: k.conditionalDefault("account", "authRulesProgram", {
				ifTrue: defaultsToSysvarInstructions(),
			}),
		},
		sellerTokenRecord: {
			defaultsTo: k.conditionalDefault("account", "authRulesProgram", {
				ifTrue: defaultsToTokenRecordPda(),
			}),
		},
	};
};

const sellerWithMetadataPnftDefault = () => {
	return {
		...sellerPnftDefault(),
		metadata: {
			defaultsTo: k.conditionalDefault("account", "authRulesProgram", {
				ifTrue: defaultsToMetadataPda(),
			}),
		},
	};
};

const claimPnftDefault = () => {
	return {
		...sellerPnftDefault(),
		authorityPdaTokenRecord: {
			defaultsTo: k.conditionalDefault("account", "authRulesProgram", {
				ifTrue: defaultsToTokenRecordPda("mint", "authorityPdaTokenAccount"),
			}),
		},
		buyerTokenRecord: {
			defaultsTo: k.conditionalDefault("account", "authRulesProgram", {
				ifTrue: defaultsToTokenRecordPda("mint", "buyerTokenAccount"),
			}),
		},
	};
};

// Update instructions.
kinobi.update(
	new k.UpdateInstructionsVisitor({
		"gumballGuard.initialize": {
			name: "initializeGumballGuard",
			internal: true,
			accounts: {
				gumballGuard: {
					defaultsTo: k.pdaDefault("gumballGuard", { importFrom: "hooked" }),
				},
			},
		},
		"mallowGumball.initialize": { name: "initializeGumballMachine" },
		"mallowGumball.addNft": {
			name: "addNft",
			accounts: {
				seller: { defaultsTo: k.identityDefault() },
				...sellerPnftDefault(),
			},
		},
		"mallowGumball.requestAddNft": {
			name: "requestAddNft",
			accounts: {
				seller: { defaultsTo: k.identityDefault() },
				addItemRequest: { defaultsTo: defaultsToAddItemRequestPda("mint") },
				...sellerPnftDefault(),
			},
		},
		"mallowGumball.cancelAddNftRequest": {
			name: "cancelAddNftRequest",
			accounts: {
				seller: { defaultsTo: k.identityDefault() },
				tokenAccount: {
					defaultsTo: defaultsToAssociatedTokenPda("mint", "seller"),
				},
				addItemRequest: { defaultsTo: defaultsToAddItemRequestPda("mint") },
				...sellerWithMetadataPnftDefault(),
			},
		},
		"mallowGumball.removeNft": {
			name: "removeNft",
			accounts: {
				authority: { defaultsTo: k.identityDefault() },
				seller: { defaultsTo: k.identityDefault() },
				tokenAccount: {
					defaultsTo: defaultsToAssociatedTokenPda("mint", "authority"),
				},
				...sellerWithMetadataPnftDefault(),
			},
		},
		"mallowGumball.addCoreAsset": {
			name: "addCoreAsset",
			accounts: {
				seller: { defaultsTo: k.identityDefault() },
			},
		},
		"mallowGumball.requestAddCoreAsset": {
			name: "requestAddCoreAsset",
			accounts: {
				seller: { defaultsTo: k.identityDefault() },
			},
		},
		"mallowGumball.cancelAddCoreAssetRequest": {
			name: "cancelAddCoreAssetRequest",
			accounts: {
				seller: { defaultsTo: k.identityDefault() },
			},
		},
		"mallowGumball.removeCoreAsset": {
			name: "removeCoreAsset",
			accounts: {
				authority: { defaultsTo: k.identityDefault() },
				seller: { defaultsTo: k.identityDefault() },
			},
		},
		"mallowGumball.addTokens": {
			name: "addTokens",
			accounts: {
				seller: { defaultsTo: k.identityDefault() },
			},
		},
		"mallowGumball.removeTokens": {
			name: "removeTokens",
			accounts: {
				authority: { defaultsTo: k.identityDefault() },
				seller: { defaultsTo: k.identityDefault() },
			},
		},
		"mallowGumball.removeTokensSpan": {
			name: "removeTokensSpan",
			accounts: {
				authority: { defaultsTo: k.identityDefault() },
				seller: { defaultsTo: k.identityDefault() },
			},
		},
		"mallowGumball.draw": {
			name: "drawFromGumballMachine",
			accounts: {
				buyer: { defaultsTo: k.identityDefault() },
			},
		},
		"gumballGuard.draw": {
			internal: true,
			args: {
				label: { name: "group" },
			},
			accounts: {
				gumballGuard: { defaultsTo: defaultsToGumballGuardPda("gumballMachine") },
				buyer: { defaultsTo: k.identityDefault() },
			},
		},
		"mallowGumball.claimNft": {
			name: "claimNft",
			accounts: {
				buyer: { defaultsTo: k.identityDefault() },
				buyerTokenAccount: {
					defaultsTo: defaultsToAssociatedTokenPda("mint", "buyer"),
				},
				...claimPnftDefault(),
			},
		},
		"mallowGumball.claimCoreAsset": {
			name: "claimCoreAsset",
			accounts: {
				buyer: { defaultsTo: k.identityDefault() },
			},
		},
		"mallowGumball.claimTokens": {
			name: "claimTokens",
			accounts: {
				buyer: { defaultsTo: k.identityDefault() },
				buyerTokenAccount: {
					defaultsTo: defaultsToAssociatedTokenPda("mint", "buyer"),
				},
			},
		},
		"mallowGumball.sellItem": {
			name: "sellItemBack",
			accounts: {
				seller: { defaultsTo: k.identityDefault() },
				sellerPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "seller"),
					}),
				},
				authorityPdaPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authorityPda"),
					}),
				},
				metadata: {
					defaultsTo: k.conditionalDefault("account", "tokenMetadataProgram", {
						ifTrue: defaultsToMetadataPda(),
					}),
				},
				edition: {
					defaultsTo: k.conditionalDefault("account", "tokenMetadataProgram", {
						ifTrue: defaultsToMasterEditionPda(),
					}),
				},
				authorityPdaTokenAccount: {
					defaultsTo: k.conditionalDefault("account", "tokenMetadataProgram", {
						ifTrue: defaultsToAssociatedTokenPda("mint", "authorityPda"),
					}),
				},
				sellerTokenAccount: {
					defaultsTo: k.conditionalDefault("account", "tokenMetadataProgram", {
						ifTrue: defaultsToAssociatedTokenPda("mint", "seller"),
					}),
				},
				buyerTokenAccount: {
					defaultsTo: k.conditionalDefault("account", "tokenMetadataProgram", {
						ifTrue: defaultsToAssociatedTokenPda("mint", "buyer"),
					}),
				},
				...claimPnftDefault(),
			},
		},
		"gumballGuard.route": {
			internal: true,
			args: {
				label: { name: "group" },
			},
			accounts: {
				gumballGuard: { defaultsTo: defaultsToGumballGuardPda("gumballMachine") },
			},
		},
		"mallowGumball.settleNftSale": {
			name: "baseSettleNftSale",
			accounts: {
				buyer: { defaultsTo: k.identityDefault() },
				buyerTokenAccount: { defaultsTo: defaultsToAssociatedTokenPda("mint", "buyer") },
				authorityPdaPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authorityPda"),
					}),
				},
				authorityPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authority"),
					}),
				},
				sellerPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "seller"),
					}),
				},
				...claimPnftDefault(),
			},
		},
		"mallowGumball.settleCoreAssetSale": {
			name: "baseSettleCoreAssetSale",
			accounts: {
				buyer: { defaultsTo: k.identityDefault() },
				authorityPdaPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authorityPda"),
					}),
				},
				authorityPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authority"),
					}),
				},
				sellerPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "seller"),
					}),
				},
			},
		},
		"mallowGumball.settleTokensSale": {
			name: "settleTokensSale",
			accounts: {
				buyer: { defaultsTo: k.identityDefault() },
				buyerTokenAccount: { defaultsTo: defaultsToAssociatedTokenPda("mint", "buyer") },
				authorityPdaPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authorityPda"),
					}),
				},
				authorityPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authority"),
					}),
				},
				sellerPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "seller"),
					}),
				},
			},
		},
		"mallowGumball.settleTokensSaleClaimed": {
			name: "settleTokensSaleClaimed",
			accounts: {
				authorityPdaPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authorityPda"),
					}),
				},
				authorityPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authority"),
					}),
				},
				sellerPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "seller"),
					}),
				},
				sellerTokenAccount: {
					defaultsTo: defaultsToAssociatedTokenPda("mint", "seller"),
				},
			},
		},
		"mallowGumball.SetAuthority": { name: "SetGumballMachineAuthority" },
		"gumballGuard.SetAuthority": { name: "SetGumballGuardAuthority" },
		"gumballGuard.update": { name: "updateGumballGuard", internal: true },
		"mallowGumball.withdraw": { name: "deleteGumballMachine" },
		"gumballGuard.withdraw": { name: "deleteGumballGuard" },
		"mallowGumball.manageBuyBackFunds": {
			name: "manageBuyBackFunds",
			accounts: {
				authorityPdaPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authorityPda"),
					}),
				},
				authorityPaymentAccount: {
					defaultsTo: k.conditionalDefault("account", "paymentMint", {
						ifTrue: defaultsToAssociatedTokenPda("paymentMint", "authority"),
					}),
				},
			},
		},
	}),
);

kinobi.update(new k.FlattenInstructionArgsStructVisitor());

const addItemDefaultArgs = k.vStruct({
	sellerProofPath: k.vNone(),
	index: k.vNone(),
});

const nftDefaultArgs = {
	authRulesProgram: k.vNone(),
	sellerTokenRecord: k.vNone(),
	buyerTokenRecord: k.vNone(),
	authorityPdaTokenRecord: k.vNone(),
	instructions: k.vNone(),
	authRules: k.vNone(),
};
kinobi.update(
	new k.SetStructDefaultValuesVisitor({
		addItemArgs: {
			sellerProofPath: k.vNone(),
			index: k.vNone(),
		},
		addNftInstructionData: { args: addItemDefaultArgs, ...nftDefaultArgs },
		removeNftInstructionData: nftDefaultArgs,
		claimNftInstructionData: nftDefaultArgs,
		sellItemInstructionData: {
			...nftDefaultArgs,
			feeAccount: k.vNone(),
			feePaymentAccount: k.vNone(),
		},
		settleNftSaleInstructionData: nftDefaultArgs,
		requestAddNftInstructionData: { sellerProofPath: k.vNone() },
		cancelAddNftRequestInstructionData: { sellerProofPath: k.vNone() },
		addCoreAssetInstructionData: { args: addItemDefaultArgs },
		addTokensInstructionData: { args: addItemDefaultArgs },
		initializeGumballMachineInstructionData: {
			feeConfig: k.vNone(),
			disablePrimarySplit: k.vScalar(false),
			buyBackConfig: k.vNone(),
			disableRoyalties: k.vScalar(false),
		},
		updateSettingsInstructionData: {
			buyBackConfig: k.vNone(),
		},
	}),
);

// Wrap numbers.
kinobi.update(
	new k.SetNumberWrappersVisitor({
		"startDate.date": { kind: "DateTime" },
		"endDate.date": { kind: "DateTime" },
		"botTax.lamports": { kind: "SolAmount" },
		"solPayment.lamports": { kind: "SolAmount" },
	}),
);

// Custom serializers.
kinobi.update(
	new k.UseCustomAccountSerializerVisitor({
		gumballMachine: { extract: true },
	}),
);

// Render JavaScript.
const jsDir = path.join(clientDir, "js", "src", "generated");
kinobi.accept(
	new k.RenderJavaScriptVisitor(jsDir, {
		prettier: require(path.join(clientDir, "js", ".prettierrc.json")),
		dependencyMap: {
			mplTokenMetadata: "@metaplex-foundation/mpl-token-metadata",
		},
	}),
);
