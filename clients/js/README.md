# JavaScript client

A generated JavaScript library for the Mallow Jellybean program.

## Getting started

The tests run against LiteSVM, so no local validator is needed — but they do load
`target/deploy/mallow_jellybean.so`, so build the program first.

```sh
# Build the program from the root of the repository.
pnpm programs:build

# Go into the client directory and run the tests.
cd clients/js
pnpm install
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
