install:
  podman run --rm -it --workdir /app -v $(pwd):/app docker.io/node:22 npm ci --legacy-peer-deps

build:
  podman run --rm -it --workdir /app -v $(pwd):/app docker.io/node:22 npm run build

start:
  podman run --rm -it --workdir /app -v $(pwd):/app docker.io/node:22 npm run start
