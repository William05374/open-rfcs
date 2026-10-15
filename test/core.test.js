import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAttributes, ValueValidator } from '../src/index.js';

describe('sanitizeAttributes', () => {
  it('passes through primitives unchanged', () => {
    const { sanitized, dropped, warnings } = sanitizeAttributes({
      str: 'hello',
      num: 42,
      bool: true,
      nil: null
    });
    assert.deepEqual(sanitized, { str: 'hello', num: 42, bool: true, nil: null });
    assert.deepEqual(dropped, []);
    assert.deepEqual(warnings, []);
  });

  it('rejects NaN and Infinity', () => {
    const { sanitized, dropped } = sanitizeAttributes({
      a: NaN,
      b: Infinity,
      c: -Infinity
    });
    assert.deepEqual(sanitized, {});
    assert.deepEqual(dropped, ['a', 'b', 'c']);
  });

  it('rejects functions and symbols', () => {
    const { sanitized, dropped } = sanitizeAttributes({
      f: () => {},
      s: Symbol('x')
    });
    assert.deepEqual(sanitized, {});
    assert.equal(dropped.length, 2);
  });

  it('truncates long strings and warns', () => {
    const long = 'x'.repeat(5000);
    const { sanitized, dropped, warnings } = sanitizeAttributes(
      { big: long },
      { maxStringLength: 100 }
    );
    assert.equal(sanitized.big.length, 100);
    assert.deepEqual(dropped, []);
    assert.equal(warnings.length, 1);
  });

  it('coerces safe bigints to numbers', () => {
    const { sanitized, dropped } = sanitizeAttributes({
      big: 123n
    });
    assert.equal(sanitized.big, 123);
    assert.equal(typeof sanitized.big, 'number');
    assert.deepEqual(dropped, []);
  });

  it('rejects bigints outside safe integer range', () => {
    const tooBig = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const { sanitized, dropped } = sanitizeAttributes({
      big: tooBig
    });
    assert.deepEqual(sanitized, {});
    assert.deepEqual(dropped, ['big']);
  });

  it('accepts homogeneous arrays', () => {
    const { sanitized, dropped } = sanitizeAttributes({
      list: [1, 2, 3],
      strs: ['a', 'b']
    });
    assert.deepEqual(sanitized.list, [1, 2, 3]);
    assert.deepEqual(sanitized.strs, ['a', 'b']);
    assert.deepEqual(dropped, []);
  });

  it('rejects non-homogeneous arrays', () => {
    const { sanitized, dropped } = sanitizeAttributes({
      mixed: [1, 'two', 3]
    });
    assert.deepEqual(sanitized, {});
    assert.deepEqual(dropped, ['mixed']);
  });

  it('rejects arrays exceeding max length', () => {
    const { sanitized, dropped } = sanitizeAttributes(
      { big: new Array(200).fill(0) },
      { maxArrayLength: 128 }
    );
    assert.deepEqual(sanitized, {});
    assert.deepEqual(dropped, ['big']);
  });

  it('accepts Uint8Array', () => {
    const buf = new Uint8Array([1, 2, 3]);
    const { sanitized, dropped } = sanitizeAttributes({ data: buf });
    assert.equal(sanitized.data, buf);
    assert.deepEqual(dropped, []);
  });

  it('rejects nested arrays beyond max depth', () => {
    // OTel attributes don't support arbitrary nesting, so we reject
    // anything beyond maxDepth as a safeguard.
    const nested = { deeply: [[[[42]]]] };
    const { sanitized, dropped } = sanitizeAttributes(nested, { maxDepth: 3 });
    assert.deepEqual(sanitized, {});
    assert.deepEqual(dropped, ['deeply']);
  });

  it('rejects plain objects as values', () => {
    const { sanitized, dropped } = sanitizeAttributes({
      obj: { a: 1 }
    });
    assert.deepEqual(sanitized, {});
    assert.deepEqual(dropped, ['obj']);
  });

  it('rejects Dates and Maps', () => {
    const { sanitized, dropped } = sanitizeAttributes({
      d: new Date(),
      m: new Map()
    });
    assert.deepEqual(sanitized, {});
    assert.equal(dropped.length, 2);
  });

  it('drops empty-string keys', () => {
    const { sanitized, dropped } = sanitizeAttributes({
      '': 'value',
      valid: 'ok'
    });
    assert.deepEqual(sanitized, { valid: 'ok' });
    assert.deepEqual(dropped, ['']);
  });
});

describe('ValueValidator', () => {
  it('validates a single value directly', () => {
    const v = new ValueValidator();
    assert.deepEqual(v.validate(42), { value: 42, error: null });
    assert.equal(v.validate(NaN).value, null);
    assert.ok(v.validate(NaN).error);
  });

  it('respects custom maxStringLength', () => {
    const v = new ValueValidator({ maxStringLength: 5 });
    const result = v.validate('abcdef');
    assert.equal(result.value, 'abcde');
    assert.equal(result.error, 'string truncated');
  });
});
