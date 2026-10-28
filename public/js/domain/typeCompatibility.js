/*
 * Source-to-target type compatibility.
 *
 * Source types come from schema/field-type-normalizer.js. Target types come from
 * the template parameter definitions (addresses[].type, params[].type, ...).
 *
 * Result:
 *   { compatible: boolean, severity: 'ok' | 'warning' | 'error', message: string }
 *
 *   - error   blocks save
 *   - warning does not block save; it is shown to the designer
 *   - ok      silent
 *
 * This module only decides design-time compatibility. Runtime conversion and
 * validation are the middleware's responsibility.
 */

import { FIELD_TYPES } from '../schema/field-type-normalizer.js';

export const COMPATIBILITY_SEVERITY = Object.freeze({
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error',
});

/** Target types with a compatibility rule. */
export const TARGET_TYPES = Object.freeze(['string', 'phone', 'email', 'number', 'decimal', 'integer', 'date', 'datetime', 'boolean']);

/**
 * Target type aliases. "url" is text at the transport level, so it uses the
 * string rules.
 */
const TARGET_TYPE_ALIASES = Object.freeze({
  url: 'string',
});

const T = FIELD_TYPES;

/** Explicit compatible pairs, keyed "<source>-><target>". Anything not listed is incompatible. */
const RULES = Object.freeze({
  [`${T.TEXT}->phone`]: { severity: COMPATIBILITY_SEVERITY.WARNING, message: 'Văn bản sẽ được dùng làm số điện thoại và được kiểm tra khi chạy.' },
  [`${T.TEXT}->email`]: { severity: COMPATIBILITY_SEVERITY.WARNING, message: 'Văn bản sẽ được dùng làm email và được kiểm tra khi chạy.' },
  [`${T.PHONE}->phone`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Số điện thoại khớp với đích số điện thoại.' },
  [`${T.EMAIL}->email`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Email khớp với đích email.' },
  [`${T.INTEGER}->number`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Số nguyên khớp với đích số.' },
  [`${T.INTEGER}->decimal`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Số nguyên khớp với đích số thập phân.' },
  [`${T.NUMBER}->number`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Số khớp với đích số.' },
  [`${T.NUMBER}->decimal`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Số khớp với đích số thập phân.' },
  [`${T.DECIMAL}->number`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Số thập phân khớp với đích số.' },
  [`${T.DECIMAL}->decimal`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Số thập phân khớp với đích số thập phân.' },
  [`${T.DATE}->date`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Ngày khớp với đích ngày.' },
  [`${T.DATE_TIME}->datetime`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Ngày giờ khớp với đích ngày giờ.' },
  [`${T.DATE_TIME}->date`]: { severity: COMPATIBILITY_SEVERITY.WARNING, message: 'Ngày giờ sẽ được cắt thành ngày khi chạy.' },
  [`${T.BOOLEAN}->boolean`]: { severity: COMPATIBILITY_SEVERITY.OK, message: 'Boolean khớp với đích boolean.' },
});

/**
 * @param {string} sourceType - normalized source type (see FIELD_TYPES)
 * @param {string} targetType - template target type
 * @returns {{ compatible: boolean, severity: string, message: string }}
 */
export function checkTypeCompatibility(sourceType, targetType) {
  if (!sourceType || sourceType === T.UNKNOWN) {
    return {
      compatible: true,
      severity: COMPATIBILITY_SEVERITY.WARNING,
      message: 'Kiểu dữ liệu của trường chưa xác định; giá trị sẽ được kiểm tra khi chạy.',
    };
  }

  const target = TARGET_TYPE_ALIASES[targetType] ?? targetType;

  if (!TARGET_TYPES.includes(target)) {
    return {
      compatible: true,
      severity: COMPATIBILITY_SEVERITY.WARNING,
      message: `Kiểu đích "${targetType}" chưa có quy tắc tương thích; giá trị sẽ được kiểm tra khi chạy.`,
    };
  }

  if (target === 'string') {
    return { compatible: true, severity: COMPATIBILITY_SEVERITY.OK, message: `${sourceType} có thể gửi dưới dạng văn bản.` };
  }

  const rule = RULES[`${sourceType}->${target}`];
  if (rule) {
    return { compatible: rule.severity !== COMPATIBILITY_SEVERITY.ERROR, severity: rule.severity, message: rule.message };
  }

  return {
    compatible: false,
    severity: COMPATIBILITY_SEVERITY.ERROR,
    message: `${sourceType} không thể dùng làm ${target}.`,
  };
}
