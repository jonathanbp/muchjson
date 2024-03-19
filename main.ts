// deno-lint-ignore-file no-explicit-any
import { parseArgs } from "https://deno.land/std/cli/parse_args.ts";
import { walk } from "https://deno.land/std/fs/mod.ts";
import { ulid } from "https://deno.land/std@0.207.0/ulid/mod.ts";
// @deno-types="https://cdn.skypack.dev/@types/lodash?dts"
import {
  set,
  get,
  join,
  shuffle,
  isObject,
  isArray,
} from "https://cdn.skypack.dev/lodash-es?dts";
import { randomName, randomVarName } from "./names.ts";

interface IValueGenerator {
  generate(current: object): any;
}

class DefaultValueGenerator implements IValueGenerator {
  constructor(private options: any) {}
  generate() {
    // if options is an object return null otherwise return options
    return this.options;
  }
}

class NameValueGenerator implements IValueGenerator {
  constructor(private options: any) {}

  generate() {
    return randomName();
  }
}

class IdValueGenerator implements IValueGenerator {
  generate() {
    return ulid();
  }
}

class EnumValueGenerator implements IValueGenerator {
  constructor(private options: any) {}
  generate() {
    // enum options are in options property of options
    return this.options.options[
      Math.floor(Math.random() * this.options.options.length)
    ];
  }
}

class FileValueGenerator implements IValueGenerator {
  private readonly filenames: string[];
  // options include directory, unique
  constructor(private options: any) {
    // Read a directory and store the filenames
    const names = [];
    for (const entry of Deno.readDirSync(this.options.directory)) {
      if (entry.isFile) {
        names.push(this.options.directory + "/" + entry.name);
      }
    }
    this.filenames = shuffle(names);
  }

  // Read the file and return the content
  read(file?: string): string {
    // TODO: cache the file content maybe
    if (!file) return "";
    // TODO: for testing we inly return the first 10 characters
    return Deno.readTextFileSync(file);
    //return Deno.readTextFileSync(file).slice(0, 10);
  }

  generate() {
    if (this.filenames.length === 0) return null;
    if (this.options.unique) {
      return this.read(this.filenames.pop());
    }
    return this.read(
      this.filenames[Math.floor(Math.random() * this.filenames.length)],
    );
  }
}

class ReferenceValueGenerator implements IValueGenerator {
  constructor(
    private options: any,
    private valueTrackers: Map<string, ValueTracker>,
  ) {}
  // TODO pick one or more
  generate() {
    const valuesToPickFrom = this.valueTrackers
      .get(this.options.otherGenerator || this.options.other)
      ?.get(this.options.property);
    // return a random value
    return valuesToPickFrom
      ? valuesToPickFrom[Math.floor(Math.random() * valuesToPickFrom.length)]
      : null;
  }
}

function randomBetween({ min, max }) {
  return Math.floor((min || 0) + Math.random() * (max || 0));
}

function maybeGenerate(
  options: any,
  valueTrackers: Map<string, ValueTracker>,
  output: object,
): string {
  // If options is a string return it, otherwise try to generate a value
  if (typeof options === "string") return options;
  return (
    createValueGenerator(options?.generator, options, valueTrackers).generate(
      output,
    ) || ""
  );
}

class JoinValueGenerator implements IValueGenerator {
  elementValueGenerator: IValueGenerator;
  constructor(
    private options: any,
    private valueTrackers: Map<string, ValueTracker>,
  ) {
    // Create the internal value generator
    this.elementValueGenerator = createValueGenerator(
      options?.element?.generator,
      options?.element,
      this.valueTrackers,
    );
  }
  generate(output: object) {
    // How many elements to create?
    const count = randomBetween(this.options?.count || { min: 1, max: 10 });
    // Create some elements
    const elements = [];
    for (let i = 0; i < count; i++) {
      elements.push(this.elementValueGenerator.generate(output));
    }

    const prefix = maybeGenerate(
      this.options?.prefix,
      this.valueTrackers,
      output,
    );
    const suffix = maybeGenerate(
      this.options?.suffix,
      this.valueTrackers,
      output,
    );

    return prefix + join(elements, this.options?.separator || "") + suffix;
  }
}

/** The CopyValueGenerator is used to copy a value another property of the same object */
class CopyValueGenerator implements IValueGenerator {
  constructor(
    private options: any,
    private valueTrackers: Map<string, ValueTracker>,
  ) {}
  generate(current: any) {
    return (
      maybeGenerate(this.options?.prefix, this.valueTrackers, current) +
      get(current, this.options?.from) +
      maybeGenerate(this.options?.suffix, this.valueTrackers, current)
    );
  }
}

class CsvValueGenerator implements IValueGenerator {
  constructor(private options: any) {}
  generate() {
    const columns = randomBetween(this.options?.columns || { min: 1, max: 5 });
    const rows = randomBetween(this.options?.rows || { min: 1, max: 50 });

    const header = [];
    for (let i = 0; i < columns; i++) {
      header.push(randomName());
    }

    const data = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < columns; j++) {
        row.push(Math.trunc(Math.random() * 1000));
      }
      data.push(row);
    }

    // render the csv
    const csv = [header.join(",")];
    for (const row of data) {
      csv.push(row.join(","));
    }
    return csv.join("\n");
  }
}

class JavaScriptValueGenerator implements IValueGenerator {
  private readonly generators: (() => string)[];
  constructor(private options: any) {
    this.generators = [
      // Simple if statement
      () => {
        const foo = randomVarName();
        return `
var ${foo} = 123;
if (${foo} > 100) {
  Notification.show("foo", "Foo was >100");
}`;
      },
      // Simple for loop
      () => {
        const foo = randomVarName();
        return `
for (var ${foo} = 0; ${foo} < 10; ${foo}++) {
  Log.info(${foo});
}`;
      },
      // Simple while loop
      () => {
        const foo = randomVarName();
        return `
var ${foo} = 0;
while (${foo} < 10) {
  Log.info(${foo});
  ${foo}++;
}`;
      },
      // Simple function
      () => {
        const foo = randomVarName();
        return `
function ${foo}(a, b) {
  return a + b;
}`;
      },
      // Simple objects
      () => {
        const foo = randomVarName();
        return `
var ${foo} = {
  a: 123,
  b: "foo"
}`;
      },
      // Click a field
      () => {
        const foo = randomVarName();
        return `
var ${foo} = new Field("**/a/b/c") 
${foo}.click();`;
      },
      // Read a value from a field
      () => {
        const foo = randomVarName();
        return `
var ${foo} = new Field("**/a/b/c") 
var value = ${foo}.read();`;
      },
    ];
  }
  generate() {
    return this.generators[
      Math.floor(Math.random() * this.generators.length)
    ]();
  }
}

function createValueGenerator(
  name: string,
  options: any,
  valueTrackers: Map<string, ValueTracker>,
) {
  switch (name?.toLowerCase()) {
    case "name":
      return new NameValueGenerator(options);
    case "id":
      return new IdValueGenerator();
    case "enum":
      return new EnumValueGenerator(options);
    case "file":
      return new FileValueGenerator(options);
    case "reference":
    case "ref":
      return new ReferenceValueGenerator(options, valueTrackers);
    case "join":
      return new JoinValueGenerator(options, valueTrackers);
    case "copy":
      return new CopyValueGenerator(options);
    case "csv":
      return new CsvValueGenerator(options);
    case "javascript":
      return new JavaScriptValueGenerator(options);
    default:
      return new DefaultValueGenerator(options);
  }
}

class Generator {
  private readonly flatTemplate: object;
  private readonly valueGenerators: Map<string, IValueGenerator>;

  /* A map of reference dependencies
   * The key is the generator name and the value is the '.'-delimited property name.
   *
   * Example:
   *
   * ```json
   * {
   *  "app": "descriptive.version",
   *  "user": "name.first"
   * }
   * ```
   */
  dependencies: Map<string, string> = new Map();

  constructor(
    public readonly name: string,
    public readonly iterations: number,
    template: object,
    private readonly valueTrackers: Map<string, ValueTracker>,
  ) {
    // Discover which value generators to use
    this.flatTemplate = flatten(template);
    // For each key in the template, create a value generator and store it in a map
    this.valueGenerators = new Map();
    for (const [key, options] of Object.entries(this.flatTemplate)) {
      const valueGenerator = createValueGenerator(
        options?.generator,
        options,
        valueTrackers,
      );
      this.valueGenerators.set(key, valueGenerator);

      // If the value is a reference or ref, store the reference
      if (
        options?.generator?.toLowerCase() == "reference" ||
        options?.generator?.toLowerCase() == "ref"
      ) {
        this.dependencies.set(
          options?.otherGenerator || options?.other,
          options?.property,
        );
      }
    }
  }
  generate(): object {
    // For each key in the template, use the value generator to generate a value
    const output: any = {};
    for (const key of Object.keys(this.flatTemplate)) {
      // Save the generated values in in the tracker
      const value = this.valueGenerators.get(key)?.generate(output);

      const valueTracker = this.valueTrackers.get(this.name);
      if (valueTracker?.tracks(key)) {
        valueTracker.add(key, value);
      }

      set(output, key, value);
    }
    return output;
  }
}

function flatten(target: object) {
  const output: any = {};
  function step(object: any, prev?: any, currentDepth?: number) {
    currentDepth = currentDepth || 1;
    Object.keys(object).forEach(function (key) {
      const value = object[key];

      const newKey = prev ? prev + "." + key : key;
      // If value has a generator propery it should just be used as is
      if (value?.generator) {
        output[newKey] = value;
        return;
      }

      if (!isArray(value) && isObject(value) && Object.keys(value).length) {
        return step(value, newKey, currentDepth || 0 + 1);
      }

      output[newKey] = value;
    });
  }
  step(target);
  return output;
}

/** Sort the generators by dependencies
 * @function
 * @param {Generator[]} generators - The generators to sort
 * @returns {Generator[]} - The sorted generatorsin execution order
 */
function executionOrder(generators: Generator[]): Generator[] {
  const sortedGenerators: Generator[] = [];
  while (generators.length > 0) {
    let generatorFound = false;
    for (let i = 0; i < generators.length; i++) {
      const generator = generators[i];
      // if all dependencies are in sortedGenerators we can move the generator to sortedGenerators
      if (
        generator.dependencies.size == 0 ||
        [...generator.dependencies.keys()].every((d) =>
          sortedGenerators.some((g) => g.name == d),
        )
      ) {
        sortedGenerators.push(generator);
        generators.splice(i, 1);
        generatorFound = true;
        break;
      }
    }
    if (!generatorFound) {
      // Add the rest of the generators to the sortedGenerators and break
      sortedGenerators.push(...generators);
      for (const generator of generators) {
        console.warn(
          `Unmet dependency detected for generator ${generator.name}. Dependencies: `,
          generator.dependencies,
        );
      }
      break;
    }
  }

  return sortedGenerators;
}

class ValueTracker {
  private readonly values: Map<string, any[]>;
  constructor() {
    this.values = new Map();
  }
  track(property: string) {
    if (!this.values.has(property)) {
      this.values.set(property, []);
    }
  }
  tracks(property: string): boolean {
    return this.values.has(property);
  }
  add(property: string, value: any) {
    if (this.values.has(property)) {
      // This is slow
      //this.values.set(property, [...(this.values.get(property) || []), value]);
      // This is much much faster
      this.values.get(property)?.push(value);
    } else {
      this.values.set(property, [value]);
    }
  }
  get(property: string): any[] | undefined {
    return this.values.get(property);
  }
}

class PerformanceTracker {
  // Note: All measurements are in milliseconds
  private start = 0;
  private end = 0;

  private counter = 0;
  constructor() {
    this.start = performance.now();
  }
  stop() {
    this.end = performance.now();
  }
  get duration() {
    const end = this.end || performance.now();
    return end - this.start;
  }

  get prSec() {
    return (this.counter / this.duration) * 1000;
  }

  count() {
    this.counter++;
  }
}

async function main(dir: string | undefined) {
  // TODO: A registry of all generators, a map of filename to generator
  const generators: Generator[] = [];
  const valueTrackers = new Map<string, ValueTracker>();

  for await (const entry of walk(dir || ".")) {
    if (entry.isFile && entry.name.endsWith(".json")) {
      const template = JSON.parse(await Deno.readTextFile(entry.path));

      // Name of file is <name>[.x<iteration>].json where the <iteration> is optional
      // Parse the name and create a generator by way of regex with named groups
      const re = /^(?<name>.+?)(?:\.x(?<iterations>\d+))?\.json$/;
      // Now pick out the name and the iteration
      const { groups } = entry.name.match(re) || {
        groups: { name: "", iterations: "" },
      };

      const generatorName = groups?.name;
      const iterations = parseInt(groups?.iterations || "", 10) || 1;

      if (!generatorName) {
        throw new Error("Generator name not found");
      }

      const generator = new Generator(
        generatorName,
        iterations,
        template,
        valueTrackers,
      );
      generators.push(generator);

      // Tell valueTrackers to track the all my dependencies
      for (const [key, value] of generator.dependencies) {
        if (!valueTrackers.has(key)) {
          valueTrackers.set(key, new ValueTracker());
        }
        valueTrackers.get(key)?.track(value);
      }
    }
  }

  const sortedGenerators = executionOrder(generators);
  console.log(
    "Sorted generators",
    sortedGenerators.map((g) => g.name),
  );

  // Generate the data
  const enc = (s: string) => new TextEncoder().encode(s);
  for (const generator of sortedGenerators) {
    //console.log(generator.name, generator.generate());
    const outFile = `./output/${generator.name}.jsonl`;
    console.log("Writing ", generator.iterations, "objects to file", outFile);
    // Open a file for writing
    const file = await Deno.open(outFile, {
      create: true,
      truncate: true,
      write: true,
    });

    const generatorPerformance = new PerformanceTracker();
    const singleGeneratePerformance = new PerformanceTracker();
    let lastOutputTime = 0;
    for (let i = 0; i < generator.iterations; i++) {
      // Lets write out a generate pr second value to the console
      const result = generator.generate();
      // write line to file
      await file.write(enc(JSON.stringify(result) + "\n"));

      singleGeneratePerformance.count();

      if (lastOutputTime == 0 || performance.now() - lastOutputTime > 500) {
        await Deno.stdout.write(
          enc(`${Math.round(singleGeneratePerformance.prSec)}\t\t\tobj/s\r`),
        );
        lastOutputTime = performance.now();
      }
    }
    generatorPerformance.stop();
    await Deno.stdout.write(enc("\n"));
    console.log("Total: ", Math.floor(generatorPerformance.duration), "ms");
  }
  console.log("Done");
}

// Learn more at https://deno.land/manual/examples/module_metadata#concepts
if (import.meta.main) {
  const flags = parseArgs(Deno.args, { string: ["directory"] });
  await main(flags.directory);
}
