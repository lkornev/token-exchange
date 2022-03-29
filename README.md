# An example of the Token Swap Program usage

### The scheme of the Token Swap program
https://twitter.com/pencilflip/status/1459631153082552320?s=21

### To Run locally (skip this section if you want to use devnet)
1. Run solana-test-validator
2. Download SPL locally https://github.com/solana-labs/solana-program-library/tree/762c584dfe88d857575d0e079a9022523670969b
3. cd <path-to-solana-program-library>/token-swap
4. cargo build-bpf
5. deploy <path-to-solana-program-library>/solana-program-library/target/deploy/spl_token_swap.so

      Note that spl_token_swap.so is not the default value the SPL offers to deploy, so you need to write the deploy path mannually.
  
6. Change `TOKEN_SWAP_PROGRAM_ID` in the index.ts file to the local Token Swap program id
7. Change `IS_LOCAL_DEVELOPMENT` in the index.ts file to `true`.
8. Change  "@solana/spl-token-swap": "0.1.2" to  "@solana/spl-token-swap": "0.1.3" in the package.json
9. Comment out the `nonce` in the TokenSwap.createTokenSwap function. I's not needed since 0.1.3.

### Build
npm install

### Run
npx ts-node -s index.ts
