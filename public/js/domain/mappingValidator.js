/*
 * Mapping validation engine.
 *
 * Pure function: no DOM, no state access. Input in, { valid, errors, warnings } out.
 * Only errors block save. Warnings are shown to the designer.
 *
 * Template-target rules
 *   1. Required targets must be mapped                      -> REQUIRED_MISSING          (error)
 *   2. Static values cannot be empty                        -> STATIC_EMPTY              (error)
 *   3. Field mappings cannot be empty                       -> FIELD_EMPTY               (error)
 *   4. Address targets (routing) must be mapped             -> ROUTING_MISSING           (error)
 *   5. Recipient-field targets (routing) must be mapped     -> ROUTING_MISSING           (error)
 *
 * Rules 4 and 5 apply to the routing targets of the template rather than to the
 * literal names "addresses.phone" and "customerId". Hardcoded names would tie the
 * validator to one template, and an email template has no phone address.
 *
 * Field-mapping rules (Journey entry schema)
 *   - a field mapping requires eventDefinitionKey                 -> EVENT_DEFINITION_KEY_MISSING (error)
 *   - without a READY catalog, the typed field name must be safe  -> FIELD_NAME_INVALID          (error)
 *   - the mapped field must exist in the catalog (stale otherwise) -> SOURCE_FIELD_NOT_FOUND       (error)
 *   - source and target types must be compatible                  -> TYPE_INCOMPATIBLE            (error)
 *   - a conversion that needs runtime validation                  -> TYPE_CONVERSION_REQUIRED     (warning)
 *   - a source field of unknown type                              -> UNKNOWN_SOURCE_TYPE          (warning)
 *
 * Static mappings do not depend on the schema and stay valid when it is unavailable.
 *
 * Defensive checks
 *   UNKNOWN_TARGET  - a mapping exists for a key the template does not define
 *   INVALID_MODE    - a mapping has an unsupported mode
 */

import { listMappingTargets, MAPPING_MODES } from './mappingTargets.js';
import { findField } from '../schema/field-catalog-model.js';
import { FIELD_TYPES } from '../schema/field-type-normalizer.js';
import { checkTypeCompatibility, COMPATIBILITY_SEVERITY } from './typeCompatibility.js';

/** Safe typed Data Extension field name, used when no metadata field list is available (ADR-003). */
const SAFE_TYPED_FIELD = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const VALIDATION_CODES = Object.freeze({
  NO_TEMPLATE: 'NO_TEMPLATE',
  REQUIRED_MISSING: 'REQUIRED_MISSING',
  ROUTING_MISSING: 'ROUTING_MISSING',
  FIELD_EMPTY: 'FIELD_EMPTY',
  FIELD_NAME_INVALID: 'FIELD_NAME_INVALID',
  STATIC_EMPTY: 'STATIC_EMPTY',
  SOURCE_FIELD_NOT_FOUND: 'SOURCE_FIELD_NOT_FOUND',
  EVENT_DEFINITION_KEY_MISSING: 'EVENT_DEFINITION_KEY_MISSING',
  SCHEMA_UNAVAILABLE: 'SCHEMA_UNAVAILABLE',
  TYPE_INCOMPATIBLE: 'TYPE_INCOMPATIBLE',
  TYPE_CONVERSION_REQUIRED: 'TYPE_CONVERSION_REQUIRED',
  UNKNOWN_SOURCE_TYPE: 'UNKNOWN_SOURCE_TYPE',
  UNKNOWN_TARGET: 'UNKNOWN_TARGET',
  INVALID_MODE: 'INVALID_MODE',
});

/** "Not mapped yet" codes, shown under Missing in the validation panel. */
export const MISSING_CODES = Object.freeze(
  new Set([VALIDATION_CODES.REQUIRED_MISSING, VALIDATION_CODES.ROUTING_MISSING, VALIDATION_CODES.FIELD_EMPTY])
);

/** Codes that mean a saved field no longer exists in the Journey entry schema. */
export const STALE_CODES = Object.freeze(new Set([VALIDATION_CODES.SOURCE_FIELD_NOT_FOUND]));

const MESSAGES = Object.freeze({
  [VALIDATION_CODES.NO_TEMPLATE]: 'Chưa chọn mẫu.',
  [VALIDATION_CODES.REQUIRED_MISSING]: 'Trường bắt buộc chưa được ánh xạ.',
  [VALIDATION_CODES.ROUTING_MISSING]: 'Trường địa chỉ và người nhận phải được ánh xạ.',
  [VALIDATION_CODES.FIELD_EMPTY]: 'Hãy chọn một trường đầu vào của Journey.',
  [VALIDATION_CODES.FIELD_NAME_INVALID]: 'Chỉ dùng chữ cái, số và dấu gạch dưới; tên không được bắt đầu bằng số.',
  [VALIDATION_CODES.STATIC_EMPTY]: 'Giá trị tĩnh không được để trống.',
  [VALIDATION_CODES.SOURCE_FIELD_NOT_FOUND]: 'Trường đã ánh xạ trước đó không còn trong schema đầu vào của Journey.',
  [VALIDATION_CODES.EVENT_DEFINITION_KEY_MISSING]: 'Không có định nghĩa sự kiện đầu vào của Journey; không thể lưu ánh xạ trường.',
  [VALIDATION_CODES.SCHEMA_UNAVAILABLE]: 'Schema đầu vào của Journey không khả dụng; không thể lưu ánh xạ trường.',
  [VALIDATION_CODES.TYPE_INCOMPATIBLE]: 'Kiểu dữ liệu của trường không tương thích với tham số này.',
  [VALIDATION_CODES.TYPE_CONVERSION_REQUIRED]: 'Kiểu dữ liệu của trường cần chuyển đổi khi chạy.',
  [VALIDATION_CODES.UNKNOWN_SOURCE_TYPE]: 'Trường có kiểu dữ liệu chưa xác định; giá trị sẽ được kiểm tra khi chạy.',
  [VALIDATION_CODES.UNKNOWN_TARGET]: 'Ánh xạ tham chiếu tới một đích mà mẫu không định nghĩa.',
  [VALIDATION_CODES.INVALID_MODE]: 'Chế độ ánh xạ không được hỗ trợ.',
});

/**
 * @typedef {{ code: string, targetKey: string|null, name: string|null, message: string }} ValidationIssue
 * @typedef {{ valid: boolean, errors: ValidationIssue[], warnings: ValidationIssue[] }} ValidationResult
 */

/**
 * @param {object} input
 * @param {object|null} input.template
 * @param {Record<string, { mode: string, value: string }>} input.mappings
 * @param {{ fields: ReadonlyArray<object> }|null} [input.fieldCatalog] - normalized catalog
 * @param {string|null} [input.eventDefinitionKey]
 * @returns {ValidationResult}
 */
export function validateMappings({ template, mappings = {}, fieldCatalog = null, eventDefinitionKey = null }) {
  if (!template) {
    return { valid: false, errors: [issue(VALIDATION_CODES.NO_TEMPLATE, null, null)], warnings: [] };
  }

  const targets = listMappingTargets(template);
  const targetKeys = new Set(targets.map((target) => target.key));
  const catalogReady = Boolean(fieldCatalog) && fieldCatalog.fields.length > 0;
  const errors = [];
  const warnings = [];

  for (const target of targets) {
    const mapping = mappings[target.key];

    if (!mapping) {
      if (target.required) {
        errors.push(issue(VALIDATION_CODES.REQUIRED_MISSING, target.key, target.name));
      } else if (target.isRouting) {
        errors.push(issue(VALIDATION_CODES.ROUTING_MISSING, target.key, target.name));
      }
      continue;
    }

    if (mapping.mode === MAPPING_MODES.FIELD) {
      validateFieldMapping({ target, mapping, fieldCatalog, eventDefinitionKey, catalogReady, errors, warnings });
      continue;
    }

    if (mapping.mode === MAPPING_MODES.STATIC) {
      if (typeof mapping.value !== 'string' || mapping.value.trim() === '') {
        errors.push(issue(VALIDATION_CODES.STATIC_EMPTY, target.key, target.name));
      }
      continue;
    }

    errors.push(issue(VALIDATION_CODES.INVALID_MODE, target.key, target.name));
  }

  for (const key of Object.keys(mappings)) {
    if (!targetKeys.has(key)) {
      errors.push(issue(VALIDATION_CODES.UNKNOWN_TARGET, key, key));
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateFieldMapping({ target, mapping, fieldCatalog, eventDefinitionKey, catalogReady, errors, warnings }) {
  if (!mapping.value) {
    errors.push(issue(VALIDATION_CODES.FIELD_EMPTY, target.key, target.name));
    return;
  }
  if (!eventDefinitionKey) {
    errors.push(issue(VALIDATION_CODES.EVENT_DEFINITION_KEY_MISSING, target.key, target.name));
    return;
  }
  if (!catalogReady) {
    // No metadata field list: accept a typed, safe field name (ADR-003 decision 3).
    if (!SAFE_TYPED_FIELD.test(mapping.value)) {
      errors.push(issue(VALIDATION_CODES.FIELD_NAME_INVALID, target.key, target.name));
    }
    return;
  }

  const field = findField(fieldCatalog, mapping.value);
  if (!field) {
    errors.push(issue(VALIDATION_CODES.SOURCE_FIELD_NOT_FOUND, target.key, target.name));
    return;
  }

  if (field.dataType === FIELD_TYPES.UNKNOWN) {
    warnings.push(issue(VALIDATION_CODES.UNKNOWN_SOURCE_TYPE, target.key, target.name));
    return;
  }

  const compatibility = checkTypeCompatibility(field.dataType, target.type);
  if (!compatibility.compatible) {
    errors.push(issue(VALIDATION_CODES.TYPE_INCOMPATIBLE, target.key, target.name, compatibility.message));
  } else if (compatibility.severity === COMPATIBILITY_SEVERITY.WARNING) {
    warnings.push(issue(VALIDATION_CODES.TYPE_CONVERSION_REQUIRED, target.key, target.name, compatibility.message));
  }
}

/**
 * Errors that mean "not mapped yet" (drives the Missing list in the panel).
 * @param {ValidationResult} result
 * @returns {ValidationIssue[]}
 */
export function getMissingErrors(result) {
  return result.errors.filter((item) => MISSING_CODES.has(item.code));
}

/**
 * Errors that mean a saved field is no longer available (stale mappings).
 * @param {ValidationResult} result
 * @returns {ValidationIssue[]}
 */
export function getStaleErrors(result) {
  return result.errors.filter((item) => STALE_CODES.has(item.code));
}

function issue(code, targetKey, name, message = null) {
  return { code, targetKey, name, message: message ?? MESSAGES[code] };
}
