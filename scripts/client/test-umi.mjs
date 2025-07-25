#!/usr/bin/env zx
import 'zx/globals';
import { cliArguments, workingDirectory } from '../utils.mjs';

// Start the local validator, or restart it if it is already running.
await $`pnpm validator`;

// Build the client and run the tests.
cd(path.join(workingDirectory, 'clients', 'umi'));
await $`pnpm install`;
await $`pnpm build`;
await $`pnpm test ${cliArguments()}`;
