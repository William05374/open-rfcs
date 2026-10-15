/**
 * Core validation logic for OpenTelemetry attribute values.
 *
 * A single ValueValidator instance is created per sanitize() call and reused
 * across the entire attribute map. This avoids re-allocating closures for
 * every key, which matters when sanitizing large spans.
 */
export class ValueValidator {
  constructor(options = {}) {
    /**
     * Hard cap on string length to prevent pathological values from
     * blowing up downstream exporters. The OpenTelemetry spec recommends
     * a limit but leaves the exact number to the SDK; 4096 is conservative.
     */
    this.maxStringLength = options.maxStringLength ?? 4096;
    /**
     * Maximum number of array elements. Same rationale as string length.
     */
    this.maxArrayLength = options.maxArrayLength ?? 128;
    this.maxDepth = options.maxDepth ?? 8;
  }

  /**
   * Validates and coerces a single value.
   *
   * Returns { value, error }. On success error is null and value is the
   * (possibly coerced) result. On failure value is null and error is a
   * short message.
   *
   * Booleans are accepted as-is.
   * Strings are accepted as-is, subject to length limits.
   * Finite numbers become numbers.
   * Integers stay integers; non-finite floats (NaN/Infinity) are rejected
   *   rather than coerced, because most backends serialize them as null
   *   or fail silently.
   * BigInts below Number.MAX_SAFE_INTEGER are coerced to Number for
   *   interoperability with OTLP, which has no native 64-bit integer type.
   * Plain arrays recurse element-by-element and must be homogeneous.
   */
  validate(value, depth = 0) {
    if (depth > this.maxDepth) {
      return { value: null, error: 'max depth exceeded' };
    }

    if (value === null) {
      return { value, error: null };
    }

    switch (typeof value) {
      case 'boolean':
        return { value, error: null };
      case 'string':
        if (value.length > this.maxStringLength) {
          return {
            value: value.slice(0, this.maxStringLength),
            error: 'string truncated'
          };
        }
        return { value, error: null };
      case 'number':
        if (!Number.isFinite(value)) {
          return { value: null, error: 'non-finite number' };
        }
        return { value, error: null };
      case 'bigint':
        if (value > BigInt(Number.MAX_SAFE_INTEGER) ||
            value < BigInt(Number.MIN_SAFE_INTEGER)) {
          return { value: null, error: 'bigint out of safe range' };
        }
        return { value: Number(value), error: null };
      case 'object':
        return this._validateObject(value, depth);
      default:
        return { value: null, error: `unsupported type: ${typeof value}` };
    }
  }

  _validateObject(value, depth) {
    if (Array.isArray(value)) {
      return this._validateArray(value, depth);
    }
    if (value instanceof Uint8Array) {
      return { value, error: null };
    }
    return { value: null, error: 'unsupported object type' };
  }

  _validateArray(arr, depth) {
    if (arr.length > this.maxArrayLength) {
      return {
        value: null,
        error: `array exceeds max length of ${this.maxArrayLength}`
      };
    }
    const out = [];
    let elemType = null;
    let truncated = false;

    for (const element of arr) {
      const result = this.validate(element, depth + 1);
      if (result.error) {
        if (result.error === 'string truncated') {
          truncated = true;
          out.push(result.value);
        } else {
          return result;
        }
      } else {
        out.push(result.value);
      }

      const t = typeof out[out.length - 1];
      if (elemType === null) {
        elemType = t;
      } else if (t !== elemType) {
        return { value: null, error: 'array is not homogeneous' };
      }
    }

    return {
      value: out,
      error: truncated ? 'array element truncated' : null
    };
  }
}
