default:
  @just --list

dev:
  deno task dev

run:
  deno run --allow-read --allow-write --allow-hrtime main.ts --directory=./templates

test:
  deno test

fmt:
  deno fmt

lint:
  deno lint

check:
  deno check main.ts
