// deno-lint-ignore-file no-explicit-any

import { ulid } from "@std/ulid";
import _ from "npm:lodash@4";
import { randomName, randomVarName } from "./names.ts";
import { ValueTracker } from "./trackers.ts";

/** Create a value generator based on the name */
export function createValueGenerator(
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
      return new CopyValueGenerator(options, valueTrackers);
    case "csv":
      return new CsvValueGenerator(options);
    case "javascript":
      return new JavaScriptValueGenerator();
    default:
      return new DefaultValueGenerator(options);
  }
}

export interface IValueGenerator {
  generate(current: object): any;
}

export class DefaultValueGenerator implements IValueGenerator {
  constructor(private options: any) {}
  generate() {
    // if options is an object return null otherwise return options
    return this.options;
  }
}

export class NameValueGenerator implements IValueGenerator {
  constructor(private options: any) {}

  generate() {
    return randomName();
  }
}

export class IdValueGenerator implements IValueGenerator {
  generate() {
    return ulid();
  }
}

export class EnumValueGenerator implements IValueGenerator {
  constructor(private options: any) {}
  generate() {
    // enum options are in options property of options
    return this.options.options[
      Math.floor(Math.random() * this.options.options.length)
    ];
  }
}

export class FileValueGenerator implements IValueGenerator {
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
    this.filenames = _.shuffle(names);
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

export class ReferenceValueGenerator implements IValueGenerator {
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

export type MinMax = { min?: number; max?: number };

function randomBetween({ min, max }: MinMax) {
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

export class JoinValueGenerator implements IValueGenerator {
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

    return prefix + _.join(elements, this.options?.separator || "") + suffix;
  }
}

/** The CopyValueGenerator is used to copy a value another property of the same object */
export class CopyValueGenerator implements IValueGenerator {
  constructor(
    private options: any,
    private valueTrackers: Map<string, ValueTracker>,
  ) {}
  generate(current: any) {
    return (
      maybeGenerate(this.options?.prefix, this.valueTrackers, current) +
      _.get(current, this.options?.from) +
      maybeGenerate(this.options?.suffix, this.valueTrackers, current)
    );
  }
}

export class CsvValueGenerator implements IValueGenerator {
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

export class JavaScriptValueGenerator implements IValueGenerator {
  private readonly generators: (() => string)[];
  constructor() {
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
