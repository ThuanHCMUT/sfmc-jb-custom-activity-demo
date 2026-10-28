/*
 * Per-IP fixed-window rate limiter (ADR-004).
 *
 * Keys on req.ip, which respects the trust-proxy setting already applied to the
 * app. Exceeding the window throws RateLimitError (429) with a Retry-After
 * header. Buckets expire lazily; the map is swept when it grows past a bound so
 * a burst of distinct IPs cannot grow it forever.
 */

import { RateLimitError } from '../errors.js';

const SWEEP_THRESHOLD = 10_000;

/**
 * @param {object} options
 * @param {number} options.max - maximum requests per window per IP
 * @param {number} options.windowMs - window length in milliseconds
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter({ max, windowMs }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map();
  let requestsSinceSweep = 0;

  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip ?? 'unknown';
    let bucket = buckets.get(ip);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, bucket);
    }

    if (bucket.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return next(new RateLimitError(`Too many requests. Retry in ${retryAfterSeconds} second(s).`));
    }

    bucket.count += 1;
    requestsSinceSweep += 1;
    if (requestsSinceSweep >= SWEEP_THRESHOLD) {
      requestsSinceSweep = 0;
      for (const [key, candidate] of buckets) {
        if (candidate.resetAt <= now) buckets.delete(key);
      }
    }

    return next();
  };
}