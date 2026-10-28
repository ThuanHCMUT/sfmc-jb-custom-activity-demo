/*
 * Mapping status model.
 *
 * Derives a display status for every mapping target from the current state:
 *
 *   auto      mapping exists, was matched automatically by field name and the
 *             user has not touched it
 *   manual    mapping exists and the user chose it (or it differs from the
 *             automatic suggestion, e.g. a restored or static mapping)
 *   ambiguous no mapping, but several entry fields match the target name;
 *             the designer must pick one
 *   missing   no mapping and the target must be mapped (required or routing)
 *   optional  no mapping and the target is optional
 *
 * Status is derived, never stored. The only runtime input besides the mapping
 * itself is the set of targets the user explicitly modified, so an untouched
 * automatic match keeps showing "Auto" and a reopened activity falls back to
 * comparing the restored mapping against the automatic suggestion.
 *
 * The module is pure: no DOM, no state access. The table, the summary bar and
 * the tests all share it.
 */

import { listMappingTargets, MAPPING_MODES } from './mappingTargets.js';
import { findMatchingFields } from './fieldMatching.js';

export const MAPPING_STATUS = Object.freeze({
  AUTO: 'auto',
  MANUAL: 'manual',
  AMBIGUOUS: 'ambiguous',
  MISSING: 'missing',
  OPTIONAL: 'optional',
});

/** Display metadata per status: chip label, icon, tooltip and row tone. */
export const STATUS_META = Object.freeze({
  [MAPPING_STATUS.AUTO]: {
    label: 'Tự động',
    icon: '\u2705',
    tooltip: 'Tự động khớp theo tên trường.',
    tone: 'auto',
  },
  [MAPPING_STATUS.MANUAL]: {
    label: 'Thủ công',
    icon: '\u270F',
    tooltip: 'Người dùng chọn thủ công.',
    tone: 'manual',
  },
  [MAPPING_STATUS.AMBIGUOUS]: {
    label: 'Mơ hồ',
    icon: '\u26A0',
    tooltip: 'Có nhiều trường khớp. Hãy chọn một trường.',
    tone: 'ambiguous',
  },
  [MAPPING_STATUS.MISSING]: {
    label: 'Thiếu',
    icon: '\u274C',
    tooltip: 'Trường bắt buộc chưa được ánh xạ.',
    tone: 'missing',
  },
  [MAPPING_STATUS.OPTIONAL]: {
    label: 'Tùy chọn',
    icon: '\u2139',
    tooltip: 'Trường tùy chọn chưa được ánh xạ.',
    tone: 'optional',
  },
});

/** Relative order used by the Status column sort (missing first). */
const STATUS_ORDER = Object.freeze({
  [MAPPING_STATUS.MISSING]: 0,
  [MAPPING_STATUS.AMBIGUOUS]: 1,
  [MAPPING_STATUS.MANUAL]: 2,
  [MAPPING_STATUS.AUTO]: 3,
  [MAPPING_STATUS.OPTIONAL]: 4,
});

/**
 * Derives the display status of one target.
 *
 * @param {object} input
 * @param {{ key: string, name: string, required: boolean, isRouting: boolean }} input.target
 * @param {{ mode: string, value: string }|null} input.mapping
 * @param {ReadonlyArray<{ id: string, name: string }>} [input.fields] - normalized entry fields
 * @param {Set<string>} [input.modifiedTargets] - targets the user changed explicitly
 * @returns {string} one of MAPPING_STATUS
 */
export function deriveMappingStatus({ target, mapping, fields = [], modifiedTargets = new Set() }) {
  if (!mapping) {
    const matches = findMatchingFields(target.name, fields);
    if (matches.length > 1) return MAPPING_STATUS.AMBIGUOUS;
    if (target.required || target.isRouting) return MAPPING_STATUS.MISSING;
    return MAPPING_STATUS.OPTIONAL;
  }

  if (modifiedTargets.has(target.key)) return MAPPING_STATUS.MANUAL;

  if (mapping.mode === MAPPING_MODES.FIELD) {
    const matches = findMatchingFields(target.name, fields);
    if (matches.length === 1 && matches[0].id === mapping.value) {
      return MAPPING_STATUS.AUTO;
    }
  }

  return MAPPING_STATUS.MANUAL;
}

/**
 * Counts every status of a template. The "missing" bucket includes ambiguous
 * rows (they are not mapped either), so mapped + missing + optional = total.
 *
 * @param {object} input
 * @param {object|null} input.template
 * @param {Record<string, { mode: string, value: string }>} input.mappings
 * @param {ReadonlyArray<object>} [input.fields]
 * @param {Set<string>} [input.modifiedTargets]
 * @returns {{ total: number, mapped: number, auto: number, manual: number,
 *             missing: number, ambiguous: number, optional: number }}
 */
export function summarizeMappings({ template, mappings = {}, fields = [], modifiedTargets = new Set() }) {
  const targets = listMappingTargets(template);
  const counts = { total: targets.length, mapped: 0, auto: 0, manual: 0, missing: 0, ambiguous: 0, optional: 0 };

  for (const target of targets) {
    const status = deriveMappingStatus({
      target,
      mapping: mappings[target.key] ?? null,
      fields,
      modifiedTargets,
    });
    switch (status) {
      case MAPPING_STATUS.AUTO:
        counts.auto += 1;
        counts.mapped += 1;
        break;
      case MAPPING_STATUS.MANUAL:
        counts.manual += 1;
        counts.mapped += 1;
        break;
      case MAPPING_STATUS.AMBIGUOUS:
        counts.ambiguous += 1;
        counts.missing += 1;
        break;
      case MAPPING_STATUS.MISSING:
        counts.missing += 1;
        break;
      default:
        counts.optional += 1;
    }
  }

  return counts;
}

/** Values of the filter dropdown. */
export const MAPPING_FILTERS = Object.freeze({
  ALL: 'all',
  REQUIRED: 'required',
  OPTIONAL: 'optional',
  MISSING: 'missing',
  MAPPED: 'mapped',
});

/**
 * @param {{ target: object, status: string }} row
 * @param {string} filter - one of MAPPING_FILTERS
 * @returns {boolean}
 */
export function matchesMappingFilter(row, filter) {
  switch (filter) {
    case MAPPING_FILTERS.REQUIRED:
      return row.target.required || row.target.isRouting;
    case MAPPING_FILTERS.OPTIONAL:
      return !row.target.required && !row.target.isRouting;
    case MAPPING_FILTERS.MISSING:
      return row.status === MAPPING_STATUS.MISSING || row.status === MAPPING_STATUS.AMBIGUOUS;
    case MAPPING_FILTERS.MAPPED:
      return row.status === MAPPING_STATUS.AUTO || row.status === MAPPING_STATUS.MANUAL;
    case MAPPING_FILTERS.ALL:
    default:
      return true;
  }
}

/**
 * Case-insensitive substring search over the template field name, the group
 * title, the target type, the selected DE field (id, name and label) and the
 * static value.
 *
 * @param {{ target: object, mapping: object|null, field: object|null }} row
 * @param {string} query
 * @returns {boolean}
 */
export function matchesMappingSearch(row, query) {
  const q = query.trim().toLowerCase();
  if (q === '') return true;

  const parts = [row.target.name, row.target.groupId, row.target.type ?? ''];
  if (row.mapping) {
    if (row.mapping.mode === MAPPING_MODES.STATIC) {
      parts.push(row.mapping.value);
    } else if (row.field) {
      parts.push(row.field.id, row.field.name, row.field.label, row.field.dataType);
    } else if (row.mapping.value !== '') {
      parts.push(row.mapping.value);
    }
  }

  return parts.join(' ').toLowerCase().includes(q);
}

/** Sortable column keys. */
export const SORT_KEYS = Object.freeze(['type', 'name', 'required', 'status']);

/**
 * Comparator for two row views. "type" compares the group id, "name" the
 * template field name, "required" puts required targets first, "status" uses
 * STATUS_ORDER. Ties keep the template order (stable sort).
 *
 * @param {{ target: object, status: string }} a
 * @param {{ target: object, status: string }} b
 * @param {string} key - one of SORT_KEYS
 * @param {'asc'|'desc'} direction
 * @returns {number}
 */
export function compareRows(a, b, key, direction) {
  const factor = direction === 'desc' ? -1 : 1;
  let comparison = 0;

  switch (key) {
    case 'type':
      comparison = a.target.groupId.localeCompare(b.target.groupId);
      break;
    case 'name':
      comparison = a.target.name.localeCompare(b.target.name);
      break;
    case 'required':
      comparison = Number(Boolean(b.target.required || b.target.isRouting)) - Number(Boolean(a.target.required || a.target.isRouting));
      break;
    case 'status':
      comparison = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      break;
    default:
      return 0;
  }

  return comparison === 0 ? 0 : comparison * factor;
}