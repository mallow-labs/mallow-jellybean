# JavaScript client

A generated JavaScript library for the Mallow Jellybean program.

## Getting started

To build and test your JavaScript client, start the validator and run the tests directly from the client directory.

```sh
# Build your programs and start the validator.
pnpm programs:build
pnpm validator

# Go into the client directory and run the tests.
cd clients/js
pnpm install
pnpm build
pnpm test
```

## Available client scripts.

You may also use the following scripts to lint and/or format your JavaScript client.

```sh
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:fix
```
