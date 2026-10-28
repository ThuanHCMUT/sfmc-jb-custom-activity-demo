/*
 * Journey Builder lifecycle controller.
 *
 * Every handler returns a success or a structured error. No handler returns
 * 404 or 501 for a valid call.
 *
 * The activity definition is read from the verified JWT claims when verification
 * is enabled, otherwise from the request body. The claims or body may wrap the
 * activity under an "activity" key; otherwise the root object is the activity.
 */

import {
  validateActivityDefinition,
  validateForPublish,
  prepareNotification,
  describeLifecycleRequest,
} from '../services/lifecycle-service.js';
import { redactPayload } from '../services/notification-payload-builder.js';
import { ValidationError } from '../errors.js';
import { logger } from '../logger.js';

export class JourneyController {
  /**
   * @param {object} deps
   * @param {import('../services/templateService.js').TemplateService} deps.templateService
   * @param {{ send: (payload: object) => Promise<object> }} deps.notificationHub
   * @param {string} [deps.sourceLabel] - payload "source" label (NOTIFICATION_HUB_SOURCE)
   */
  constructor({ templateService, notificationHub, sourceLabel = '' }) {
    this.templateService = templateService;
    this.notificationHub = notificationHub;
    this.sourceLabel = sourceLabel;
  }

  /** POST /journey/save */
  save = async (req, res) => {
    logRequestShape('save', req);
    const activity = activityFrom(req);
    const templates = await this.templateService.getTemplates();
    const result = validateActivityDefinition({ activity, templates });
    if (!result.valid) {
      throw new ValidationError('The activity configuration is invalid.', result.errors);
    }
    logger.info('Activity configuration saved');
    return res.status(200).json({ success: true });
  };

  /** POST /journey/validate */
  validate = async (req, res) => {
    logRequestShape('validate', req);
    const activity = activityFrom(req);
    const templates = await this.templateService.getTemplates();
    const result = validateActivityDefinition({ activity, templates });
    if (!result.valid) {
      throw new ValidationError('The activity configuration is invalid.', result.errors);
    }
    return res.status(200).json({ success: true });
  };

  /** POST /journey/publish */
  publish = async (req, res) => {
    logRequestShape('publish', req);
    const activity = activityFrom(req);
    const templates = await this.templateService.getTemplates();
    const result = validateForPublish({ activity, templates });
    if (!result.valid) {
      throw new ValidationError('The activity cannot be published.', result.errors);
    }
    logger.info('Activity published');
    return res.status(200).json({ success: true, status: 'published' });
  };

  /** POST /journey/stop. Idempotent: stopping an activity with no state is a success. */
  stop = async (req, res) => {
    logger.info('Activity stop notification received');
    return res.status(200).json({ success: true, status: 'stopped' });
  };

  /** POST /journey/execute. One contact per call. */
  execute = async (req, res) => {
    const source = requestSource(req);
    const templates = await this.templateService.getTemplates();
    const payload = prepareNotification({ source, templates, sourceLabel: this.sourceLabel });
    // Info level logs only the shape with values redacted; the full payload is
    // logged at debug level (LOG_LEVEL=debug) for payload verification.
    logger.info(`Notification Hub payload (redacted): ${JSON.stringify(redactPayload(payload))}`);
    logger.debug(`Notification Hub payload: ${JSON.stringify(payload)}`);
    await this.notificationHub.send(payload);
    logger.info('Notification accepted');
    return res.status(200).json({ success: true, status: 'accepted' });
  };
}

/**
 * Logs the shape of a lifecycle request (key names and flags, never values) so a
 * rejected call can be traced to what Journey Builder actually sent.
 */
function logRequestShape(name, req) {
  const shape = describeLifecycleRequest(requestSource(req), req.headers?.['content-type']);
  logger.info(`/journey/${name} request shape: ${JSON.stringify(shape)}`);
}

/** Verified claims when present, otherwise the request body. */
function requestSource(req) {
  return req.journeyClaims ?? req.body ?? {};
}

function activityFrom(req) {
  const source = requestSource(req);
  return source.activity && typeof source.activity === 'object' ? source.activity : source;
}
