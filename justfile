container := "podman run --rm -it --workdir /app -v $(pwd):/app docker.io/node:24"

[default]
default:
  @just --justfile {{justfile()}} --list

# install dependencies
install:
  {{container}} npm ci --legacy-peer-deps

# build the CLI
build:
  {{container}} npm run build

# start the CLI
start:
  {{container}} npm run start
