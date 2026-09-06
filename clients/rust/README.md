# Rust client

A generated Rust library for the Mallow Jellybean program.

## Getting started

To build and test your Rust client from the root of the repository, you may use the following command.

```sh
pnpm clients:rust:test
```

The Rust client is generated code with no runtime dependencies on a cluster, so this
runs `cargo test` against the crate directly — no validator required.
