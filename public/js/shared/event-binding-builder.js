/*
 * Event binding builder (shared).
 *
 * Unquoted Event binding syntax (SPEC-NHT-011):
 *
 *   {{Event.<eventDefinitionKey>.<FieldName>}}
 *
 * FieldName must be a plain identifier (^[A-Za-z_][A-Za-z0-9_]*$). Inputs must be
 * normalized metadata. Arbitrary text is never placed inside an expression, so no
 * escaping is needed and an expression cannot be closed early.
 *
 * Live Journey Builder confirmation of this syntax is a mandatory gate.
 */

const SAFE_EVENT_DEFINITION_KEY = /^[A-Za-z0-9_-]{1,128}$/;
/** Field names may contain spaces (quoted syntax), but never quotes, braces, backslashes or line breaks. */
const SAFE_BINDING_PATH = /^[^"\\{}\r\n\t]{1,128}$/;
/** Unquoted Event binding form is only valid for plain identifiers (SPEC-NHT-011 section 2.1). */
const SAFE_BINDING_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const BINDING_CODES = Object.freeze({
  EVENT_DEFINITION_KEY_INVALID: 'EVENT_DEFINITION_KEY_INVALID',
  BINDING_PATH_INVALID: 'BINDING_PATH_INVALID',
  BINDING_PATH_EMPTY: 'BINDING_PATH_EMPTY',
});

/**
 * @param {object} input
 * @param {string} input.eventDefinitionKey
 * @param {string} input.bindingPath - field name as declared by the entry Data Extension
 * @returns {{ valid: true, value: string } | { valid: false, error: { code: string, message: string } }}
 */
export function buildEventBinding({ eventDefinitionKey, bindingPath }) {
  if (typeof eventDefinitionKey !== 'string' || !SAFE_EVENT_DEFINITION_KEY.test(eventDefinitionKey)) {
    return fail(BINDING_CODES.EVENT_DEFINITION_KEY_INVALID, 'Khóa định nghĩa sự kiện có định dạng không được hỗ trợ.');
  }
  if (typeof bindingPath !== 'string' || bindingPath.trim() === '') {
    return fail(BINDING_CODES.BINDING_PATH_EMPTY, 'Đường dẫn ràng buộc đang để trống.');
  }
  if (!SAFE_BINDING_PATH.test(bindingPath) || !SAFE_BINDING_IDENTIFIER.test(bindingPath)) {
    return fail(BINDING_CODES.BINDING_PATH_INVALID, 'Đường dẫn ràng buộc phải là tên trường thuần (chữ cái, chữ số, dấu gạch dưới; không bắt đầu bằng chữ số).');
  }
  return { valid: true, value: `{{Event.${eventDefinitionKey}.${bindingPath}}}` };
}

function fail(code, message) {
  return { valid: false, error: { code, message } };
}
