/*
 * Centralized error handling. Responses use one shape:
 *   { "success": false, "error": { "code", "message", "details" } }
 *
 * Stack traces, raw downstream bodies and internal paths are never returned.
 */

import { AppError } from '../errors.js';
import { logger } from '../logger.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error(`Request failed with ${err.code}`, err);
    } else {
      logger.warn(`Request rejected: ${err.code} ${req.method} ${req.path}${describeDetails(err.details)}`);
    }
    return res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details ?? [] },
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_JSON', message: 'The request body is not valid JSON.', details: [] },
    });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.', details: [] },
    });
  }

  logger.error('Unhandled error', err);
  return res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An internal error occurred.', details: [] },
  });
}

/**
 * Codes and keys of the error details, for the log only. Details never carry
 * values (see errors.js), so this names what failed without exposing data.
 */
function describeDetails(details) {
  if (!Array.isArray(details) || details.length === 0) return '';
  const parts = details
    .slice(0, 10)
    .map((detail) => (detail?.key ? `${detail.code}:${detail.key}` : detail?.code))
    .filter(Boolean);
  return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
}
