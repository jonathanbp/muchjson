# MuchJson

`muchjson` is a tool for generating random JSON data.

## Setup

Install dependencies using [mise](https://mise.jdx.dev/):

```sh
mise install
```

## Usage

Run with:

```sh
just run
```

Or directly with Deno:

```sh
deno run --allow-read --allow-write --allow-hrtime main.ts --directory=./templates
```

## Development

Available commands via [just](https://github.com/casey/just):

```sh
just dev    # Run in development mode
just test   # Run tests
just fmt    # Format code
just lint   # Lint code
just check  # Type check
```
