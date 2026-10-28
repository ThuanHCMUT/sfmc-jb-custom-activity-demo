/**
 * Guards the vendored Postmonger SDK (SPEC-NHT-007).
 * The classic <script src="js/vendor/postmonger.js"> must exist and expose
 * window.Postmonger.Session, otherwise the Custom Activity cannot talk to
 * Journey Builder (postmonger-client.js throws "Postmonger SDK is not available.").
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const vendorPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/js/vendor/postmonger.js');

describe('vendored Postmonger SDK', () => {
  it('exists at public/js/vendor/postmonger.js', () => {
    expect(existsSync(vendorPath)).toBe(true);
  });

  it('exposes Postmonger.Session when loaded as a classic script', () => {
    const source = readFileSync(vendorPath, 'utf8');
    const sandbox = { console };
    sandbox.window = sandbox;
    vm.runInNewContext(source, sandbox);

    expect(typeof sandbox.window.Postmonger).toBe('object');
    expect(typeof sandbox.window.Postmonger.Session).toBe('function');
  });
});