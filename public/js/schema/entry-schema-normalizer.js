/*
 * Entry-schema normalizer.
 *
 * The ONLY module that knows the shape of Journey Builder metadata. It accepts
 * the raw requestedSchema payload and returns plain results with the normalized
 * field model. It never throws because of one malformed entry.
 *
 * Shape read:
 *   requestedSchema payload
 *     {
 *       schema: [
 *         {
 *           key: "Event.<eventDefinitionKey>.<FieldName>",
 *           name: "FieldName",
 *           type: "Text" | "Phone" | "Number" | ...,
 *           length?, default?, isNullable?, isPrimaryKey?
 *         }
 *       ]
 *     }
 *
 *   The event definition key is the segment between "Event." and the last ".",
 *   for example "DEAudience-54f86e57-78be-3afb-d054-83c8eff7ccea". Every field of one
 *   payload belongs to the same entry source. Nothing is invented: a payload without
 *   a usable schema array yields SCHEMA_NOT_AVAILABLE.
 *
 * Result shapes:
 *   normalizeSchemaPayload -> { eventDefinitionKey, fieldList, error }
 *   normalizeFieldList     -> { valid, eventDefinitionKey, fields, warnings, error }
 *   error.code: SCHEMA_NOT_AVAILABLE | INVALID_EVENT_DEFINITION | EVENT_DEFINITION_KEY_MISSING | EVENT_DEFINITION_KEY_INVALID
 */

import { normalizeFieldType, FIELD_TYPES } from './field-type-normalizer.js';
import { createFieldModel, SOURCE_TYPES } from './field-catalog-model.js';

export const SCHEMA_ERROR_CODES = Object.freeze({
  SCHEMA_NOT_AVAILABLE: 'SCHEMA_NOT_AVAILABLE',
  INVALID_EVENT_DEFINITION: 'INVALID_EVENT_DEFINITION',
  EVENT_DEFINITION_KEY_MISSING: 'EVENT_DEFINITION_KEY_MISSING',
  EVENT_DEFINITION_KEY_INVALID: 'EVENT_DEFINITION_KEY_INVALID',
});

export const SCHEMA_WARNING_CODES = Object.freeze({
  FIELD_SKIPPED: 'FIELD_SKIPPED',
  DUPLICATE_FIELD: 'DUPLICATE_FIELD',
  UNKNOWN_FIELD_TYPE: 'UNKNOWN_FIELD_TYPE',
});

/** Event definition keys are alphanumeric with underscores or hyphens (e.g. DEAudience-<guid>). */
const SAFE_EVENT_DEFINITION_KEY = /^[A-Za-z0-9_-]+$/;
const SAFE_FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** "Event.<eventDefinitionKey>.<FieldName>": the middle segment is the event definition key. */
const FIELD_KEY_PATTERN = /^Event\.(.+)\.([^.]+)$/;
const MAX_FIELDS = 500;

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Reads the requestedSchema payload and extracts the event definition key.
 * Never throws.
 *
 * @param {unknown} payload
 * @returns {{ eventDefinitionKey: string|null, fieldList: Array<unknown>|null, error: { code: string, message: string } | null }}
 */
export function normalizeSchemaPayload(payload) {
  if (!isPlainObject(payload)) {
    return {
      eventDefinitionKey: null,
      fieldList: null,
      error: { code: SCHEMA_ERROR_CODES.INVALID_EVENT_DEFINITION, message: 'Journey Builder không trả về schema đầu vào.' },
    };
  }

  if (!Array.isArray(payload.schema) || payload.schema.length === 0) {
    return {
      eventDefinitionKey: null,
      fieldList: null,
      error: { code: SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE, message: 'Journey Builder không trả về schema đầu vào.' },
    };
  }

  const key = eventDefinitionKeyOf(payload.schema[0]);
  const keyError = checkEventDefinitionKey(key);

  return {
    eventDefinitionKey: keyError === null ? key : null,
    fieldList: payload.schema,
    error: keyError,
  };
}

/**
 * Normalizes a raw field list into the field catalog model.
 *
 * - Skips malformed entries and records a FIELD_SKIPPED warning.
 * - Skips entries that belong to another event definition (FIELD_SKIPPED).
 * - Removes duplicates (first occurrence wins) with a DUPLICATE_FIELD warning.
 * - Never mutates the input.
 *
 * @param {unknown} rawFieldList
 * @param {string} eventDefinitionKey
 * @returns {{ valid: boolean, eventDefinitionKey: string, fields: object[], warnings: object[], error: object|null }}
 */
export function normalizeFieldList(rawFieldList, eventDefinitionKey) {
  if (!Array.isArray(rawFieldList) || rawFieldList.length === 0) {
    return unavailable(eventDefinitionKey, 'Journey Builder không trả về danh sách trường đầu vào.');
  }

  const warnings = [];
  const seen = new Set();
  const fields = [];

  rawFieldList.slice(0, MAX_FIELDS).forEach((raw, index) => {
    const normalized = normalizeField(raw);
    if (!normalized || eventDefinitionKeyOf(raw) !== eventDefinitionKey) {
      warnings.push({ code: SCHEMA_WARNING_CODES.FIELD_SKIPPED, index, message: `Trường ở vị trí ${index} bị bỏ qua vì sai định dạng.` });
      return;
    }
    if (seen.has(normalized.id)) {
      warnings.push({ code: SCHEMA_WARNING_CODES.DUPLICATE_FIELD, index, message: `Trường trùng "${normalized.id}" đã bị bỏ qua.` });
      return;
    }
    seen.add(normalized.id);
    fields.push(normalized);
    if (normalized.dataType === FIELD_TYPES.UNKNOWN) {
      warnings.push({ code: SCHEMA_WARNING_CODES.UNKNOWN_FIELD_TYPE, index, message: `Trường "${normalized.id}" có kiểu dữ liệu chưa xác định.` });
    }
  });

  if (fields.length === 0) {
    return unavailable(eventDefinitionKey, 'Journey Builder không trả về trường nào có thể sử dụng.');
  }

  return { valid: true, eventDefinitionKey, fields, warnings, error: null };
}

/**
 * Converts one raw field entry. Returns null when the entry has no usable name.
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
export function normalizeField(raw) {
  if (!isPlainObject(raw)) return null;

  const name = resolveFieldName(raw);
  if (!name || !SAFE_FIELD_NAME.test(name)) return null;

  return createFieldModel({
    id: name,
    name,
    label: humanize(name),
    dataType: normalizeFieldType(raw.type),
    source: SOURCE_TYPES.ENTRY_EVENT,
    bindingPath: name,
    nullable: typeof raw.isNullable === 'boolean' ? raw.isNullable : undefined,
    length: Number.isInteger(raw.length) && raw.length >= 0 ? raw.length : undefined,
    isPrimaryKey: typeof raw.isPrimaryKey === 'boolean' ? raw.isPrimaryKey : undefined,
  });
}

/**
 * Produces a structural description of a payload: property names and types only.
 * Values are never included, so the output is safe to log in debug mode.
 *
 * @param {unknown} value
 * @param {number} [depth=2]
 * @returns {string}
 */
export function describeStructure(value, depth = 2) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'array(0)';
    if (depth <= 0) return `array(${value.length})`;
    return `array(${value.length})[${describeStructure(value[0], depth - 1)}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).slice(0, 30);
    if (depth <= 0) return '{...}';
    return `{${keys.map((key) => `${key}:${describeStructure(value[key], depth - 1)}`).join(',')}}`;
  }
  return typeof value;
}

/**
 * Returns the event definition key embedded in a raw field's key, or null.
 * "Event.DEAudience-<guid>.Phone" -> "DEAudience-<guid>".
 */
function eventDefinitionKeyOf(raw) {
  if (!isPlainObject(raw) || typeof raw.key !== 'string') return null;
  const match = FIELD_KEY_PATTERN.exec(raw.key);
  return match ? match[1] : null;
}

/** Returns the error for an unusable key, or null when the key is usable. */
function checkEventDefinitionKey(key) {
  if (key === null || key.trim() === '') {
    return { code: SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_MISSING, message: 'Journey Builder không trả về khóa định nghĩa sự kiện.' };
  }
  if (!SAFE_EVENT_DEFINITION_KEY.test(key)) {
    return { code: SCHEMA_ERROR_CODES.EVENT_DEFINITION_KEY_INVALID, message: 'Khóa định nghĩa sự kiện có định dạng không được hỗ trợ.' };
  }
  return null;
}

function resolveFieldName(raw) {
  if (typeof raw.name === 'string' && raw.name.trim() !== '') {
    return raw.name.trim();
  }
  if (typeof raw.key === 'string') {
    const segment = raw.key.slice(raw.key.lastIndexOf('.') + 1).trim();
    return segment === '' ? null : segment;
  }
  return null;
}

/** "CustomerId" -> "Customer Id", "order_amount" -> "order amount". */
function humanize(name) {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .trim();
}

function unavailable(eventDefinitionKey, message) {
  return {
    valid: false,
    eventDefinitionKey,
    fields: [],
    warnings: [],
    error: { code: SCHEMA_ERROR_CODES.SCHEMA_NOT_AVAILABLE, message },
  };
}
