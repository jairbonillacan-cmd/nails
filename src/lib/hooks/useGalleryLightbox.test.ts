import { describe, expect, it, vi } from 'vitest';
import {
  detectHorizontalSwipe,
  getAdjacentGalleryIndices,
  preloadGalleryImages,
  resolveLightboxKeyboardAction,
  subscribeLightboxKeyboard,
  wrapGalleryIndex,
  type LightboxKeyboardEventLike,
  type LightboxKeyboardTargetLike,
  type PreloadImageDescriptor,
  type PreloadImageTarget,
} from './useGalleryLightbox';

describe('wrapGalleryIndex', () => {
  it('wraps cleanly forward and backward across boundaries', () => {
    expect(wrapGalleryIndex(0, 1, 11)).toBe(1);
    expect(wrapGalleryIndex(10, 1, 11)).toBe(0);
    expect(wrapGalleryIndex(0, -1, 11)).toBe(10);
    expect(wrapGalleryIndex(2, -5, 11)).toBe(8);
    expect(wrapGalleryIndex(0, 1, 1)).toBe(0);
    expect(wrapGalleryIndex(0, -1, 1)).toBe(0);
  });

  it('returns null when total is zero or negative', () => {
    expect(wrapGalleryIndex(0, 1, 0)).toBeNull();
    expect(wrapGalleryIndex(0, 1, -3)).toBeNull();
  });
});

describe('getAdjacentGalleryIndices', () => {
  it('returns next and prev indices wrapped around edges', () => {
    expect(getAdjacentGalleryIndices(0, 11)).toEqual([1, 10]);
    expect(getAdjacentGalleryIndices(5, 11)).toEqual([6, 4]);
    expect(getAdjacentGalleryIndices(10, 11)).toEqual([0, 9]);
  });

  it('deduplicates adjacent index for two-item galleries and returns empty for <= 1 or closed', () => {
    expect(getAdjacentGalleryIndices(0, 2)).toEqual([1]);
    expect(getAdjacentGalleryIndices(1, 2)).toEqual([0]);
    expect(getAdjacentGalleryIndices(0, 1)).toEqual([]);
    expect(getAdjacentGalleryIndices(null, 11)).toEqual([]);
  });
});

describe('lightbox keyboard navigation', () => {
  it('resolves ArrowLeft, ArrowRight, and Escape while ignoring unrelated or modified keys', () => {
    expect(resolveLightboxKeyboardAction({ key: 'ArrowLeft' })).toBe('prev');
    expect(resolveLightboxKeyboardAction({ key: 'ArrowRight' })).toBe('next');
    expect(resolveLightboxKeyboardAction({ key: 'Escape' })).toBe('close');
    expect(resolveLightboxKeyboardAction({ key: 'Enter' })).toBeNull();
    expect(resolveLightboxKeyboardAction({ key: 'ArrowRight', ctrlKey: true })).toBeNull();
    expect(resolveLightboxKeyboardAction({ key: 'ArrowLeft', metaKey: true })).toBeNull();
    expect(resolveLightboxKeyboardAction({ key: 'Escape', altKey: true })).toBeNull();
  });

  it('subscribes, dispatches handlers with preventDefault, and cleans up on unsubscribe', () => {
    const listeners = new Set<(event: LightboxKeyboardEventLike) => void>();
    const target: LightboxKeyboardTargetLike = {
      addEventListener(_type, listener) {
        listeners.add(listener);
      },
      removeEventListener(_type, listener) {
        listeners.delete(listener);
      },
    };
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onClose = vi.fn();

    const unsubscribe = subscribeLightboxKeyboard(target, {
      onPrev,
      onNext,
      onClose,
    });

    const fire = (key: string) => {
      const preventDefault = vi.fn();
      for (const listener of listeners) {
        listener({ key, preventDefault });
      }
      return preventDefault;
    };

    expect(fire('ArrowRight')).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);

    expect(fire('ArrowLeft')).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);

    expect(fire('Escape')).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(fire('Tab')).not.toHaveBeenCalled();

    unsubscribe();
    expect(listeners.size).toBe(0);
    fire('ArrowRight');
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe('detectHorizontalSwipe', () => {
  it('detects left and right swipes when horizontal travel exceeds threshold and dominates vertical delta', () => {
    expect(detectHorizontalSwipe({ x: 240, y: 300 }, { x: 160, y: 312 })).toBe('left');
    expect(detectHorizontalSwipe({ x: 120, y: 300 }, { x: 210, y: 288 })).toBe('right');
  });

  it('ignores short taps, vertical scrolling, and ambiguous diagonals', () => {
    expect(detectHorizontalSwipe({ x: 200, y: 300 }, { x: 170, y: 300 })).toBeNull();
    expect(detectHorizontalSwipe({ x: 200, y: 300 }, { x: 140, y: 420 })).toBeNull();
    expect(detectHorizontalSwipe({ x: 200, y: 300 }, { x: 250, y: 345 })).toBeNull();
    expect(detectHorizontalSwipe({ x: 200, y: 300 }, { x: 230, y: 300 }, 25)).toBe('right');
  });
});

describe('preloadGalleryImages', () => {
  it('preloads unique descriptors with sizes, srcset, and src and skips duplicates or empty sources', () => {
    const created: PreloadImageTarget[] = [];
    const createImage = () => {
      const target: PreloadImageTarget = { src: '' };
      created.push(target);
      return target;
    };
    const cache = new Set<string>();
    const items: PreloadImageDescriptor[] = [
      {
        src: '/_next/image?url=%2Flanding%2Fsets%2Ffoto-007.webp&w=640&q=75',
        srcSet: '/_next/image?url=%2Flanding%2Fsets%2Ffoto-007.webp&w=390&q=75 390w',
        sizes: '(max-width: 47.5rem) 92vw, 32rem',
      },
      { src: '   ' },
      {
        src: '/_next/image?url=%2Flanding%2Fsets%2Ffoto-007.webp&w=640&q=75',
        srcSet: '/_next/image?url=%2Flanding%2Fsets%2Ffoto-007.webp&w=390&q=75 390w',
        sizes: '(max-width: 47.5rem) 92vw, 32rem',
      },
      {
        src: '/_next/image?url=%2Flanding%2Fsets%2F01-azul-joya-4x5.webp&w=640&q=75',
      },
    ];

    const firstPass = preloadGalleryImages(items, cache, createImage);
    expect(firstPass).toHaveLength(2);
    expect(created).toHaveLength(2);
    expect(created[0]).toEqual({
      src: '/_next/image?url=%2Flanding%2Fsets%2Ffoto-007.webp&w=640&q=75',
      srcset: '/_next/image?url=%2Flanding%2Fsets%2Ffoto-007.webp&w=390&q=75 390w',
      sizes: '(max-width: 47.5rem) 92vw, 32rem',
    });
    expect(created[1]).toEqual({
      src: '/_next/image?url=%2Flanding%2Fsets%2F01-azul-joya-4x5.webp&w=640&q=75',
    });

    const secondPass = preloadGalleryImages(items, cache, createImage);
    expect(secondPass).toHaveLength(0);
    expect(created).toHaveLength(2);
  });
});
