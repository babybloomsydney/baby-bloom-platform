import { describe, it, expect } from 'vitest';

describe('vitest smoke test', () => {
  it('runs and asserts truthy', () => {
    expect(1 + 1).toBe(2);
    expect('katie').toBeTruthy();
  });

  it('has jsdom environment', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });
});
