# open-rfcs

Validates and coerces key-value attribute pairs against OpenTelemetry semantic type constraints, returning a sanitized map plus a list of keys that were dropped.

## Usage

```js
import { sanitizeAttributes } from 'open-rfcs';

const { sanitized, dropped, warnings } = sanitizeAttributes({
  'http.status_code': 200,
  'http.method': 'GET',
  'custom.flag': true,
  'bad.value': NaN,
  'too.big': 9007199254740993n
});

// sanitized: { 'http.status_code': 200, 'http.method': 'GET', 'custom.flag': true }
// dropped:   [ 'bad.value', 'too.big' ]
// warnings:  [ 'dropped "bad.value": non-finite number',
//              'dropped "too.big": bigint out of safe range' ]
```

## Why this exists

OpenTelemetry attribute values are restricted to a small set of types: strings, booleans, numbers up to `MAX_SAFE_INTEGER`, homogeneous arrays of those, and byte arrays. Real instrumentation code produces values that fall outside these constraints: `NaN` from failed parses, `BigInt` from databases, `Date` objects from ORMs, mixed arrays from dynamic data. Exporters that receive such values either crash or silently send garbage. This library sits between instrumentation and export, dropping or coercing anything that cannot survive the wire.

The trade-off: we drop rather than best-effort-serialize. A key whose value is a `Date` or a `Map` gets removed entirely instead of being stringified, because a stringified `Date` in a numeric field confuses downstream query engines more than a missing field.

## Awkward edges

- **BigInts**: Only those within `Number.MAX_SAFE_INTEGER` are coerced to `number`. Larger values are dropped, because OTLP has no 64-bit integer type and truncation would silently corrupt data.
- **NaN / Infinity**: Dropped outright. Some backends serialize these as `null`, which is indistinguishable from a real null, so we refuse the ambiguity.
- **Arrays**: Must be homogeneous in primitive type. `[1, 2, 'three']` is rejected, not split.
- **Nested arrays**: Attribute values in OTel are at most one level deep (arrays of primitives). Deeper nesting is rejected.
- **String truncation**: Over-long strings are truncated to `maxStringLength` (default 4096) rather than dropped, because a truncated label is usually more useful than no label.
