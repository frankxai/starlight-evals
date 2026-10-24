import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "./hooks.mjs";

test("hooks resolve", async (t) => {
  await t.test("calls next successfully", async () => {
    let callCount = 0;
    const next = async (specifier, context) => {
      callCount++;
      return { url: specifier };
    };
    const result = await resolve("test.js", {}, next);
    assert.equal(result.url, "test.js");
    assert.equal(callCount, 1);
  });

  await t.test("rewrites .js to .ts for relative path on ERR_MODULE_NOT_FOUND", async () => {
    let callCount = 0;
    const next = async (specifier, context) => {
      callCount++;
      if (callCount === 1) {
        assert.equal(specifier, "./sibling.js");
        const err = new Error("not found");
        err.code = "ERR_MODULE_NOT_FOUND";
        throw err;
      }
      assert.equal(specifier, "./sibling.ts");
      return { url: specifier };
    };
    const result = await resolve("./sibling.js", {}, next);
    assert.equal(result.url, "./sibling.ts");
    assert.equal(callCount, 2);
  });

  await t.test("rewrites .js to .ts for file: path on ERR_MODULE_NOT_FOUND", async () => {
    let callCount = 0;
    const next = async (specifier, context) => {
      callCount++;
      if (callCount === 1) {
        assert.equal(specifier, "file:///path/to/sibling.js");
        const err = new Error("not found");
        err.code = "ERR_MODULE_NOT_FOUND";
        throw err;
      }
      assert.equal(specifier, "file:///path/to/sibling.ts");
      return { url: specifier };
    };
    const result = await resolve("file:///path/to/sibling.js", {}, next);
    assert.equal(result.url, "file:///path/to/sibling.ts");
    assert.equal(callCount, 2);
  });

  await t.test("does not rewrite if error is not ERR_MODULE_NOT_FOUND", async () => {
    let callCount = 0;
    const next = async (specifier, context) => {
      callCount++;
      assert.equal(specifier, "./sibling.js");
      const err = new Error("other error");
      err.code = "OTHER_ERROR";
      throw err;
    };
    await assert.rejects(
      resolve("./sibling.js", {}, next),
      { code: "OTHER_ERROR" }
    );
    assert.equal(callCount, 1);
  });

  await t.test("does not rewrite if specifier is not relative", async () => {
    let callCount = 0;
    const next = async (specifier, context) => {
      callCount++;
      assert.equal(specifier, "lodash/index.js");
      const err = new Error("not found");
      err.code = "ERR_MODULE_NOT_FOUND";
      throw err;
    };
    await assert.rejects(
      resolve("lodash/index.js", {}, next),
      { code: "ERR_MODULE_NOT_FOUND" }
    );
    assert.equal(callCount, 1);
  });

  await t.test("does not rewrite if specifier does not end with .js", async () => {
    let callCount = 0;
    const next = async (specifier, context) => {
      callCount++;
      assert.equal(specifier, "./sibling.mjs");
      const err = new Error("not found");
      err.code = "ERR_MODULE_NOT_FOUND";
      throw err;
    };
    await assert.rejects(
      resolve("./sibling.mjs", {}, next),
      { code: "ERR_MODULE_NOT_FOUND" }
    );
    assert.equal(callCount, 1);
  });
});
