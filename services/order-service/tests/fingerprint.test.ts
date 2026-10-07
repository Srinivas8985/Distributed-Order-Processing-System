import { describe, it, expect } from 'vitest';
import { RequestFingerprint } from '../src/utils/fingerprint';

describe('RequestFingerprint', () => {
  it('generates consistent hashes for identical objects regardless of key order', () => {
    const obj1 = { userId: '123', items: [{ id: '1', qty: 2 }] };
    const obj2 = { items: [{ qty: 2, id: '1' }], userId: '123' };

    const hash1 = RequestFingerprint.generate(obj1);
    const hash2 = RequestFingerprint.generate(obj2);

    expect(hash1).toBe(hash2);
  });

  it('generates different hashes for different objects', () => {
    const obj1 = { userId: '123', items: [{ id: '1', qty: 2 }] };
    const obj2 = { userId: '123', items: [{ id: '1', qty: 3 }] };

    const hash1 = RequestFingerprint.generate(obj1);
    const hash2 = RequestFingerprint.generate(obj2);

    expect(hash1).not.toBe(hash2);
  });

  it('ignores undefined properties', () => {
    const obj1 = { a: 1, b: undefined };
    const obj2 = { a: 1 };

    const hash1 = RequestFingerprint.generate(obj1);
    const hash2 = RequestFingerprint.generate(obj2);

    expect(hash1).toBe(hash2);
  });
});
