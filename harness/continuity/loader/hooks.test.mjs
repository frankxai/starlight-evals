import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from './hooks.mjs';

test('resolve hook', async (t) => {
  await t.test('passes through successful next() calls', async () => {
    let called = false;
    const next = async (spec, ctx) => {
      called = true;
      assert.equal(spec, 'foo');
      return { url: 'file:///foo' };
    };
    const result = await resolve('foo', {}, next);
    assert.ok(called);
    assert.equal(result.url, 'file:///foo');
  });

  await t.test('passes through non-ERR_MODULE_NOT_FOUND errors', async () => {
    const next = async () => { throw new Error('foo error'); };
    await assert.rejects(resolve('foo', {}, next), /foo error/);
  });

  await t.test('passes through ERR_MODULE_NOT_FOUND if specifier is not relative', async () => {
    const error = new Error('not found');
    error.code = 'ERR_MODULE_NOT_FOUND';
    const next = async () => { throw error; };
    await assert.rejects(resolve('foo', {}, next), error);
  });

  await t.test('passes through ERR_MODULE_NOT_FOUND if specifier does not end in .js', async () => {
    const error = new Error('not found');
    error.code = 'ERR_MODULE_NOT_FOUND';
    const next = async () => { throw error; };
    await assert.rejects(resolve('./foo.ts', {}, next), error);
  });

  await t.test('retries with .ts if relative specifier ends in .js and next() throws ERR_MODULE_NOT_FOUND', async () => {
    const error = new Error('not found');
    error.code = 'ERR_MODULE_NOT_FOUND';

    let calls = 0;
    const next = async (spec, ctx) => {
      calls++;
      if (calls === 1) {
        assert.equal(spec, './foo.js');
        throw error;
      }
      assert.equal(spec, './foo.ts');
      return { url: 'file:///foo.ts' };
    };

    const result = await resolve('./foo.js', {}, next);
    assert.equal(calls, 2);
    assert.equal(result.url, 'file:///foo.ts');
  });

  await t.test('retries with .ts if file: specifier ends in .js and next() throws ERR_MODULE_NOT_FOUND', async () => {
    const error = new Error('not found');
    error.code = 'ERR_MODULE_NOT_FOUND';

    let calls = 0;
    const next = async (spec, ctx) => {
      calls++;
      if (calls === 1) {
        assert.equal(spec, 'file:///foo.js');
        throw error;
      }
      assert.equal(spec, 'file:///foo.ts');
      return { url: 'file:///foo.ts' };
    };

    const result = await resolve('file:///foo.js', {}, next);
    assert.equal(calls, 2);
    assert.equal(result.url, 'file:///foo.ts');
  });

  await t.test('throws the second ERR_MODULE_NOT_FOUND if .ts also fails', async () => {
    const error = new Error('not found');
    error.code = 'ERR_MODULE_NOT_FOUND';

    const error2 = new Error('not found either');
    error2.code = 'ERR_MODULE_NOT_FOUND';

    const next = async (spec, ctx) => {
      if (spec === './foo.js') throw error;
      if (spec === './foo.ts') throw error2;
    };

    await assert.rejects(resolve('./foo.js', {}, next), error2);
  });
});
