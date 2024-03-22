import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { EnumValueGenerator } from "./generators.ts";

Deno.test(function enumValueGeneratorTest() {
  const evg = new EnumValueGenerator({ options: ["one", "two", "three"] });
  for (let i = 0; i < 100; i++) {
    const result = evg.generate();
    assertEquals(["one", "two", "three"].includes(result), true);
  }
});
