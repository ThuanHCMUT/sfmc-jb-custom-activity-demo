import { describe, it, expect, jest } from '@jest/globals';

import { createRateLimiter } from '../../server/middleware/rate-limit.middleware.js';
import { RateLimitError } from '../../server/errors.js';

function call(limiter, ip, { count = 1 } = {}) {
  const req = { ip };
  const res = { setHeader: jest.fn() };
  const next = jest.fn();
  for (let i = 0; i < count; i += 1) limiter(req, res, next);
  return { res, next };
}

describe('createRateLimiter', () => {
  it('lets requests through below the limit', () => {
    const limiter = createRateLimiter({ max: 3, windowMs: 60000 });

    const { next } = call(limiter, '1.2.3.4', { count: 3 });

    expect(next).toHaveBeenCalledTimes(3);
    expect(next).not.toHaveBeenCalledWith(expect.any(RateLimitError));
  });

  it('blocks the request that exceeds the limit with 429 and Retry-After', () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60000 });

    const { res, next } = call(limiter, '1.2.3.4', { count: 3 });

    const blocked = next.mock.calls[2][0];
    expect(blocked).toBeInstanceOf(RateLimitError);
    expect(blocked.status).toBe(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', expect.stringMatching(/^\d+$/));
  });

  it('keys buckets per IP', () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60000 });

    call(limiter, '1.2.3.4');
    const { next } = call(limiter, '5.6.7.8');

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
  });

  it('resets the window after it elapses', () => {
    jest.useFakeTimers();
    try {
      const limiter = createRateLimiter({ max: 1, windowMs: 1000 });

      call(limiter, '1.2.3.4');
      jest.advanceTimersByTime(1001);
      const { next } = call(limiter, '1.2.3.4');

      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});