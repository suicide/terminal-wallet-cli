# Terminal Wallet

## Build and Run

Run with podman:

```shell
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm ci --legacy-peer-deps
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm run build
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm run start
```

Or use `just` which also uses this podman setup

## On-Chain Config Contract

<https://etherscan.io/address/0x5e982525d50046A813DBf55Ae72a3E00e99fbC94>

Use local config to override/replace on-chain config:

```shell
cp local-config.json.example local-config.json
```

This copies an up-to-date example config
