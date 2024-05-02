# MuchJson

`muchjson` is a tool for generating random JSON data. It takes a directory of template files, and converts them to a directory of dummy data.

Run with:

```sh
deno run --allow-read --allow-write --allow-hrtime main.ts --directory=./templates
```

## Usage

Generate a directory of template files to configure the data generation. Each file in the template directory should be named following the format `<name>.x[iterations].json` (e.g. `applications.x50.json`). Each file should contain a template object (see the code for more details on what this entails):

```sh
$ tree ./templates
./templates
├── application.x50.json
├── field.x500.json
├── flow.x400.json
└── table.x100.json

$ cat ./templates/application.x50.json
{
  "id": { "generator": "Id" },
  "name": { "generator": "Name" },
  "descriptive": {
    "type": {
      "generator": "enum",
      "options": ["WEB-HCHROME", "WEB-CHROME", "WEB-EDGE", "WEB-FF"]
    },
    "urlcontains": { "generator": "Name" },
    "launchwith": { "generator": "Name" }
  }
}
```

Then run the script using Deno, specifying the directory using the `--directory` parameter:

```sh
deno run --allow-read --allow-write --allow-hrtime main.ts --directory=./templates
```

The dummy data will then be generated in `./output`, with one output file `<name>.jsonl` for each template file `<name>.x[iterations].json`.
