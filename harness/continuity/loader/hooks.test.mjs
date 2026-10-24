import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from './hooks.mjs';

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
