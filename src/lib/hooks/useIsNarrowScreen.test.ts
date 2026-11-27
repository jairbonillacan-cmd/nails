import { describe, expect, it } from 'vitest';
import {
  ADMIN_MOBILE_MEDIA_QUERY,
  useIsNarrowScreen,
  useMediaQueryHydrated,
} from './useIsNarrowScreen';

describe('useIsNarrowScreen & useMediaQueryHydrated', () => {
  it('exposes the canonical admin mobile breakpoint media query and hook functions', () => {
    expect(ADMIN_MOBILE_MEDIA_QUERY).toBe('(max-width: 47.5rem)');
    expect(typeof useIsNarrowScreen).toBe('function');
    expect(typeof useMediaQueryHydrated).toBe('function');
  });
});
