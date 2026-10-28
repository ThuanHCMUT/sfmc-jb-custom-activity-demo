import { Router } from 'express';

import { buildActivityConfig } from '../services/activity-config-builder.js';

/**
 * GET /config.json and GET /public/config.json: the activity definition Journey
 * Builder reads. Public by design; it contains no secrets. Both paths serve the
 * same definition so deployments may point the activity endpoint at the service
 * root or at https://<host>/public.
 *
 * @param {{ config: object }} deps
 * @returns {import('express').Router}
 */
export function createConfigRouter({ config }) {
  const router = Router();
  const definition = buildActivityConfig({
    publicBaseUrl: config.publicBaseUrl,
    requireJwt: config.requireJwt,
    securityContextKey: config.securityContextKey,
  });

  const sendDefinition = (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json(definition);
  };

  router.get('/config.json', sendDefinition);
  router.get('/public/config.json', sendDefinition);
  router.get('/frt/config.json', sendDefinition);

  return router;
}
