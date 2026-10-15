import { ValueValidator } from './core.js';

/**
 * Validates and coerces a map of OpenTelemetry attribute key-value pairs.
 *
 * @param {Object<string, *>} attributes - The raw attribute map.
 * @param {Object} [options]
 * @param {number} [options.maxStringLength=4096]
 * @param {number} [options.maxArrayLength=128]
 * @param {number} [options.maxDepth=8]
 * @returns {{sanitized: Object<string, *>, dropped: string[], warnings: string[]}}
 *   `sanitized` contains the cleaned attribute map. `dropped` lists keys that
 *   could not be salvaged. `warnings` lists non-fatal issues like truncation.
 */
export function sanitizeAttributes(attributes, options) {
  const validator = new ValueValidator(options);
  const sanitized = {};
  const dropped = [];
  const warnings = [];

  if (attributes === null || typeof attributes !== 'object' ||
      Array.isArray(attributes)) {
    return { sanitized: {}, dropped: [], warnings: ['attributes is not an object'] };
  }

  for (const key of Object.keys(attributes)) {
    if (typeof key !== 'string' || key.length === 0) {
      dropped.push(String(key));
      continue;
    }
    const result = validator.validate(attributes[key]);
    if (result.error && result.value === null) {
      dropped.push(key);
      warnings.push(`dropped "${key}": ${result.error}`);
    } else {
      if (result.error) {
        warnings.push(`"${key}": ${result.error}`);
      }
      sanitized[key] = result.value;
    }
  }

  return { sanitized, dropped, warnings };
}

export { ValueValidator };
