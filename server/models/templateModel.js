// Template domain model and validation.
// Pure functions only: no I/O, no Express, no Notification Hub knowledge.
//
// Channels are stored internally as canonical codes
// (ZNS, CHATAPP, SMS, LIVECHAT, BRC_ZALO) per BRD-NHC-001 / SRS FR-TPL-005.
// "ZALO" is a legacy alias of ZNS (BR-CH-003): stored activities that reference
// the old code still resolve.

export const CHANNEL_CODES = Object.freeze({
  ZNS: 'ZNS',
  CHATAPP: 'CHATAPP',
  SMS: 'SMS',
  LIVECHAT: 'LIVECHAT',
  BRC_ZALO: 'BRC_ZALO',
});

export const SUPPORTED_CHANNELS = Object.freeze(Object.values(CHANNEL_CODES));

/**
 * Normalizes a channel name for comparison: removes spaces, underscores and
 * hyphens and lowercases. "BRC Zalo", "brc_zalo" and "BRC-ZALO" are equal.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeChannelName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[_\-\s]/g, '').toLowerCase();
}

const CHANNEL_BY_NORMALIZED_NAME = Object.freeze({
  zns: CHANNEL_CODES.ZNS,
  zalo: CHANNEL_CODES.ZNS, // legacy alias (BR-CH-003)
  zalozns: CHANNEL_CODES.ZNS, // display name "Zalo ZNS"
  chatapp: CHANNEL_CODES.CHATAPP,
  sms: CHANNEL_CODES.SMS,
  livechat: CHANNEL_CODES.LIVECHAT,
  brczalo: CHANNEL_CODES.BRC_ZALO,
  zalobrc: CHANNEL_CODES.BRC_ZALO,
  broadcastoa: CHANNEL_CODES.BRC_ZALO,
});

/**
 * @param {unknown} value - display name or code
 * @returns {string|null} the channel code, or null when unsupported
 */
export function toChannelCode(value) {
  return CHANNEL_BY_NORMALIZED_NAME[normalizeChannelName(value)] ?? null;
}

export class TemplateValidationError extends Error {
  /**
   * @param {string} message
   * @param {Array<string>} [problems]
   */
  constructor(message, problems = []) {
    super(message);
    this.name = 'TemplateValidationError';
    this.problems = problems;
  }
}

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const isNamedEntry = (entry) => entry !== null && typeof entry === 'object' && isNonEmptyString(entry.name);

/**
 * Validates one raw template object from the data source.
 * Returns a list of human-readable problems; an empty list means valid.
 *
 * @param {unknown} raw
 * @returns {Array<string>}
 */
export function findTemplateProblems(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return ['template must be an object'];
  }

  const problems = [];

  if (!isNonEmptyString(raw.templateKey)) problems.push('templateKey is required');
  if (!isNonEmptyString(raw.displayName)) problems.push('displayName is required');

  if (toChannelCode(raw.channel) === null) {
    problems.push(`channel must be one of: ${SUPPORTED_CHANNELS.join(', ')}`);
  }

  if (raw.version !== undefined && !(Number.isInteger(raw.version) && raw.version >= 1)) {
    problems.push('version must be a positive integer when provided');
  }

  if (raw.content !== undefined && typeof raw.content !== 'string') {
    problems.push('content must be a string when provided');
  }

  if (!Array.isArray(raw.addresses)) {
    problems.push('addresses must be an array');
  } else if (!raw.addresses.every(isNamedEntry)) {
    problems.push('every address needs a non-empty name');
  }

  if (!Array.isArray(raw.params)) {
    problems.push('params must be an array');
  } else if (!raw.params.every(isNamedEntry)) {
    problems.push('every param needs a non-empty name');
  }

  if (raw.recipientFields !== undefined) {
    if (!Array.isArray(raw.recipientFields)) {
      problems.push('recipientFields must be an array when provided');
    } else if (!raw.recipientFields.every(isNamedEntry)) {
      problems.push('every recipientField needs a non-empty name');
    }
  }

  return problems;
}

/**
 * Register metadata fields carried through from the data source (present in the
 * Notification Hub register response) but not consumed by the mapping logic.
 */
const REGISTER_METADATA_FIELDS = Object.freeze([
  'templateId',
  'registerRow',
  'strategy',
  'failover',
  'usecase',
  'hubSubstitutedVariables',
]);

/**
 * Converts a raw, already validated object into a frozen template model with
 * defaults applied. The channel is stored as its code. Register metadata fields
 * are passed through so the API response mirrors the data source.
 *
 * @param {object} raw
 * @returns {Readonly<object>}
 */
export function createTemplateModel(raw) {
  const model = {
    templateKey: raw.templateKey,
    displayName: raw.displayName,
    channel: toChannelCode(raw.channel),
    version: raw.version ?? 1,
    content: raw.content ?? '',
    addresses: Object.freeze(raw.addresses.map((item) => Object.freeze({ ...item }))),
    recipientFields: Object.freeze((raw.recipientFields ?? []).map((item) => Object.freeze({ ...item }))),
    params: Object.freeze(raw.params.map((item) => Object.freeze({ ...item }))),
  };

  for (const field of REGISTER_METADATA_FIELDS) {
    if (raw[field] !== undefined) {
      model[field] = deepFreeze(raw[field]);
    }
  }

  return Object.freeze(model);
}

/**
 * Recursively freezes a value so the template model is immutable end to end.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    return Object.freeze(value);
  }
  return value;
}
