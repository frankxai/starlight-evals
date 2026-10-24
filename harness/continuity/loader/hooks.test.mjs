import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from './hooks.mjs';

test('resolve', async (t) => {
  await t.test('should return the result when next succeeds', async () => {
    const next = async (specifier, context) => ({ url: 'resolved_url', format: 'module' });
    const result = await resolve('test-specifier', {}, next);
    assert.deepEqual(result, { url: 'resolved_url', format: 'module' });
  });

  await t.test('should fallback to .ts for a relative .js specifier on ERR_MODULE_NOT_FOUND', async () => {
    const next = async (specifier, context) => {
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
    const result = await resolve('./sibling.js', {}, next);
    assert.deepEqual(result, { url: 'file:///sibling.ts', format: 'module' });
  });

  await t.test('should rethrow error if not ERR_MODULE_NOT_FOUND', async () => {
    const next = async (specifier, context) => {
      throw new Error('Some other error');
    };
    await assert.rejects(
      async () => resolve('./sibling.js', {}, next),
      { message: 'Some other error' }
    );
  });

  await t.test('should rethrow error if specifier is not relative', async () => {
    const next = async (specifier, context) => {
      const err = new Error('Not found');
      err.code = 'ERR_MODULE_NOT_FOUND';
      throw err;
    };
    await assert.rejects(
      async () => resolve('non-relative-specifier.js', {}, next),
      { code: 'ERR_MODULE_NOT_FOUND' }
    );
  });

  await t.test('should rethrow error if specifier does not end in .js', async () => {
    const next = async (specifier, context) => {
      const err = new Error('Not found');
      err.code = 'ERR_MODULE_NOT_FOUND';
      throw err;
    };
    await assert.rejects(
      async () => resolve('./sibling.mjs', {}, next),
      { code: 'ERR_MODULE_NOT_FOUND' }
    );
  });
});
