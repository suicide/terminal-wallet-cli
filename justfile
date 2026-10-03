# -e TERM: podman's TTY default is bare `xterm` (colors#8) and it does not forward
# the host TERM. The image has no entry for host terminals like xterm-kitty, so
# pin the 256-color description the image ships; otherwise blessed crushes the
# palette to 8 colors.
container := "podman run --rm -it -e TERM=xterm-256color --workdir /app -v $(pwd):/app docker.io/node:24"

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
