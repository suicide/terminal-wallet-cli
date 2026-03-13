# Terminal Wallet

Run with podman:

```shell
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm ci --legacy-peer-deps
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm run build
podman run --rm -it --workdir /app -v $(pwd):/app node:22 npm run start
```
