#!/bin/bash
# Re-dump the mainnet programs the LiteSVM test harness loads (see
# ../litesvm/svm.ts). Run from this directory. mpl-core in particular must stay
# a CURRENT mainnet dump — an older copy predates `CreateV2` and fails fixture
# creation with a BorshIoError.
set -euo pipefail

RPC="${RPC:-https://api.mainnet-beta.solana.com}"

# MPL Core
solana program dump -u "$RPC" CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d mpl_core.so
# Gumball Guard (routes draws through the configured guards)
solana program dump -u "$RPC" GGRDy4ieS7ExrUu313QkszyuT9o3BvDLuc3H5VLgCpSF gumball_guard.so
# MPL System Extras (mpl-toolbox `createMint` funds the mint via createAccountWithRent)
solana program dump -u "$RPC" SysExL2WDyJi9aRZrXorrjHJut3JwHQ7R9bTyctbNNG mpl_system_extras.so
