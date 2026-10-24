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

test('resolve', async (t) => {
  await t.test('should return the result when next succeeds', async () => {
    let callCount = 0;
    const next = async (specifier, context) => {
      callCount++;
      return { url: 'resolved_url', format: 'module' };
    };
    const result = await resolve('test-specifier', {}, next);
    assert.deepEqual(result, { url: 'resolved_url', format: 'module' });
    assert.equal(callCount, 1);
  });

  await t.test('should fallback to .ts for a relative .js specifier on ERR_MODULE_NOT_FOUND', async () => {
    let callCount = 0;
    const next = async (specifier, context) => {
      callCount++;
      assert.deepEqual(context, { foo: 'bar' });
      if (specifier === './sibling.js') {
        const err = new Error('Not found');
        err.code = 'ERR_MODULE_NOT_FOUND';
        throw err;
      }
      if (specifier === './sibling.ts') {
        return { url: 'file:///sibling.ts', format: 'module' };
      }
      throw new Error(`Unexpected specifier: ${specifier}`);
    };
    const result = await resolve('./sibling.js', { foo: 'bar' }, next);
    assert.deepEqual(result, { url: 'file:///sibling.ts', format: 'module' });
    assert.equal(callCount, 2);
  });

  await t.test('should rethrow error if not ERR_MODULE_NOT_FOUND', async () => {
    let callCount = 0;
    const originalError = new Error('Some other error');
    const next = async (specifier, context) => {
      callCount++;
      assert.equal(specifier, './sibling.js');
      assert.deepEqual(context, { baz: 123 });
      throw originalError;
    };
    await assert.rejects(
      async () => resolve('./sibling.js', { baz: 123 }, next),
      (err) => err === originalError
    );
    assert.equal(callCount, 1);
  });

  await t.test('should rethrow error if specifier is not relative', async () => {
    let callCount = 0;
    const originalError = new Error('Not found');
    originalError.code = 'ERR_MODULE_NOT_FOUND';
    const next = async (specifier, context) => {
      callCount++;
      assert.equal(specifier, 'non-relative-specifier.js');
      assert.deepEqual(context, { a: 'b' });
      throw originalError;
    };
    await assert.rejects(
      async () => resolve('non-relative-specifier.js', { a: 'b' }, next),
      (err) => err === originalError
    );
    assert.equal(callCount, 1);
  });

  await t.test('should rethrow error if specifier does not end in .js', async () => {
    let callCount = 0;
    const originalError = new Error('Not found');
    originalError.code = 'ERR_MODULE_NOT_FOUND';
    const next = async (specifier, context) => {
      callCount++;
      assert.equal(specifier, './sibling.mjs');
      assert.deepEqual(context, {});
      throw originalError;
    };
    await assert.rejects(
      async () => resolve('./sibling.mjs', {}, next),
      (err) => err === originalError
    );
    assert.equal(callCount, 1);
  });
});
