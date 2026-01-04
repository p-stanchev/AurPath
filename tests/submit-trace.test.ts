import { describe, expect, it } from 'vitest';
import { mapSubmitErrorClassification } from '../src/trace.js';

describe('submit error mapping', () => {
  it('maps blockhash not found to BLOCKHASH_EXPIRED', () => {
    const result = mapSubmitErrorClassification('Blockhash not found');
    expect(result).toBe('BLOCKHASH_EXPIRED');
  });

  it('maps rate limit to RPC_REJECT', () => {
    const result = mapSubmitErrorClassification('429 rate limit');
    expect(result).toBe('RPC_REJECT');
  });
});
