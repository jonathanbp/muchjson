// deno-lint-ignore-file no-explicit-any
import { parseArgs } from "jsr:@std/cli/parse_args";
import { walk } from "jsr:@std/fs";
import _ from "npm:lodash@4";
import { IValueGenerator, createValueGenerator } from "./generators.ts";
import { ValueTracker, PerformanceTracker } from "./trackers.ts";

/**
 *  A generator is a representation of a template that can generate data.
 *  It contains a map of value generators that are used to generate the data.
 *
 * @class
 * @param {string} name - The name of the generator
 * @param {number} iterations - The number of items to generate
 * @param {object} template - The template to use for generation
 */
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

      _.set(output, key, value);
    }
    return output;
  }
}

/** Flatten an object st each leaf is represented by a '.'-delimited key
 * @function
 * @param {object} target - The object to flatten
 * @returns {object} - The flattened object
 */
function flatten(target: object): object {
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

      if (!_.isArray(value) && _.isObject(value) && Object.keys(value).length) {
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
 * @returns {Generator[]} - The sorted generators in execution order
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

export async function main(dir: string | undefined) {
  // A registry of all generators, a map of filename to generator
  const generators: Generator[] = [];
  // We track values of values generated for those values that are referenced elsewhere.
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
