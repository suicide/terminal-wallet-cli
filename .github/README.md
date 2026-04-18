# Terminal Wallet

Run with podman:

```shell
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm ci --legacy-peer-deps
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm run build
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm run start
```

# On-Chain Config Contract

<https://etherscan.io/address/0x5e982525d50046A813DBf55Ae72a3E00e99fbC94>
