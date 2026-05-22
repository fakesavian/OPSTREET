import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveGeneratedDir, resolveGeneratedProjectDir } from "../src/generatedDir.js";

const importMetaUrl = new URL("../src/routes/projects.ts", import.meta.url).href;

function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
  const previous = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }

  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
}

test("generated project dir resolves OPFUN_GENERATED_DIR lazily at call time", () => {
  withEnv("OPFUN_GENERATED_DIR", undefined, () => {
    const before = resolveGeneratedProjectDir(importMetaUrl, "project-before-env");

    withEnv("OPFUN_GENERATED_DIR", "D:/2025/user/Aicode/opfun-secure-launchpad/.opfun-generated", () => {
      const after = resolveGeneratedProjectDir(importMetaUrl, "project-after-env");

      assert.notEqual(after, before);
      assert.equal(
        after,
        path.resolve("D:/2025/user/Aicode/opfun-secure-launchpad/.opfun-generated", "project-after-env"),
      );
      assert.doesNotMatch(after.replace(/\\/g, "/"), /\/tmp\/opfun-generated/);
    });
  });
});

test("resolveGeneratedDir trims and resolves configured generated dir", () => {
  withEnv("OPFUN_GENERATED_DIR", "  D:/2025/opfun-generated  ", () => {
    assert.equal(resolveGeneratedDir(importMetaUrl), path.resolve("D:/2025/opfun-generated"));
  });
});
