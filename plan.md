Mallow Jellybean

This program is very similar to the Gumball Machine program, but it can be loaded with assets that are printable (Metaplex Legacy Master Editions, or Metaplex Core collection with a MasterEdition plugin) or 1/1 nfts. All printable master editions must be limited supply. The chance of drawing any item is based on the available supply of all items in the machine.

The same Gumball Guard program as the Gumball Machine program will be used to add "guards" to the minting process (whitelist, payment amount, etc).

The Jellybean Machine should be more optimized than the Gumball Machine program in the following ways:

- Does not need to allocate the full space for all drawn items up front. Drawn item details (buyer, token standard, mint, etc) can be appended as items are drawn.
- Does not need to handle collaborative sales (no need to multiple sellers in the same machine, the creator of the machine is the seller of all pieces)

References:
Metaplex Legacy (Token Metadata): https://developers.metaplex.com/token-metadata
Metaplex Core: https://developers.metaplex.com/core
Mallow Gumball: https://github.com/mallow-labs/mallow-gumball
