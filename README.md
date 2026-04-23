# Terminal Wallet CLI

This repository is an experimental fork of [Terminal-Wallet/terminal-wallet-cli](https://github.com/Terminal-Wallet/terminal-wallet-cli).

It keeps the upstream CLI wallet as a base while adding local development tooling, local config overrides, network updates, and broadcaster-related experiments.

## What Changed in This Fork

- Added local config override support via `local-config.json`
- Added broadcaster-focused UX:
  - Listing available broadcasters
  - Selecting a broadcaster from list for transactions
  - Disabled broadcaster blacklisting
- Gas price selection enhanced
- Added additional bootstrapping nodes for the broadcaster waku network via local-config override
- Added Ethereum Sepolia support and related config updates

## Build and Run

- Node.js `>=20`
- Install dependencies with `npm ci --legacy-peer-deps`
- Rust is only required if you want to build the standalone executable

### Podman

```sh
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm ci --legacy-peer-deps
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm run build
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm run start
```

Or use `just`, which wraps the same podman setup:

```sh
just install
just build
just start
```

### Native

```sh
npm ci --legacy-peer-deps
npm run build
npm run start
```

### Standalone Executable

```sh
cargo install nj-cli
npm ci --legacy-peer-deps
npm run ship
./build/terminal-wallet-cli
```

You may need to make the binary executable with `chmod +x ./build/terminal-wallet-cli`.

## Config

### On-Chain Config Contract

<https://etherscan.io/address/0x5e982525d50046A813DBf55Ae72a3E00e99fbC94>

### Local Config Override

Use a local config file to override or replace values from the on-chain config:

```sh
cp local-config.json.example local-config.json
```

This copies an up-to-date example config.
