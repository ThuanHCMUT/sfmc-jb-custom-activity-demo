import { Router } from 'express';

/**
 * Entry-field lookup routes, mounted under /api (ADR-004, Option A).
 *
 * GET /api/entry-fields?eventDefinitionKey=<key>
 *
 * @param {object} deps
 * @param {import('../controllers/entryFieldsController.js').EntryFieldsController} deps.controller
 * @param {import('express').RequestHandler} deps.rateLimiter - per-IP rate limiting
 * @returns {import('express').Router}
 */
export function createEntryFieldsRouter({ controller, rateLimiter }) {
  const router = Router();

  router.get('/entry-fields', rateLimiter, controller.getEntryFields);

  return router;
}