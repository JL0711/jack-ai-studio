import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from '../lib/chunkErrors';

describe('on-demand file that failed to load', () => {
  it('is recognised in every browser wording', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Login-abc.js'))).toBe(true); // Chrome
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true); // Safari
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: https://x/a.js'))).toBe(true); // Firefox
  });

  it('is not confused with ordinary errors', () => {
    expect(isChunkLoadError(new Error('Invalid login credentials'))).toBe(false);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});
