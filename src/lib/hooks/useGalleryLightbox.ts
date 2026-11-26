'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PreloadImageDescriptor {
  src: string;
  srcSet?: string;
  sizes?: string;
}

export type LightboxKeyboardAction = 'prev' | 'next' | 'close';

export interface LightboxKeyboardEventLike {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  preventDefault: () => void;
}

export interface LightboxKeyboardTargetLike {
  addEventListener: (
    type: 'keydown',
    listener: (event: LightboxKeyboardEventLike) => void,
  ) => void;
  removeEventListener: (
    type: 'keydown',
    listener: (event: LightboxKeyboardEventLike) => void,
  ) => void;
}

export interface SwipePoint {
  x: number;
  y: number;
}

export type SwipeDirection = 'left' | 'right';

export interface PreloadImageTarget {
  src: string;
  srcset?: string;
  sizes?: string;
}

interface TouchPointLike {
  clientX: number;
  clientY: number;
}

interface TouchEventLike {
  touches: ArrayLike<TouchPointLike>;
  changedTouches: ArrayLike<TouchPointLike>;
}

const DEFAULT_SWIPE_THRESHOLD = 44;
const HORIZONTAL_DOMINANCE_RATIO = 1.15;

export function wrapGalleryIndex(
  current: number,
  delta: number,
  total: number,
): number | null {
  if (!Number.isInteger(total) || total <= 0) {
    return null;
  }
  const normalized = ((current + delta) % total + total) % total;
  return normalized;
}

export function getAdjacentGalleryIndices(
  activeIndex: number | null,
  total: number,
): number[] {
  if (activeIndex === null || !Number.isInteger(total) || total <= 1) {
    return [];
  }
  const nextIndex = wrapGalleryIndex(activeIndex, 1, total);
  const prevIndex = wrapGalleryIndex(activeIndex, -1, total);
  const indices: number[] = [];
  if (nextIndex !== null && nextIndex !== activeIndex) {
    indices.push(nextIndex);
  }
  if (prevIndex !== null && prevIndex !== activeIndex && prevIndex !== nextIndex) {
    indices.push(prevIndex);
  }
  return indices;
}

export function resolveLightboxKeyboardAction(
  event: Pick<LightboxKeyboardEventLike, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>,
): LightboxKeyboardAction | null {
  if (event.altKey || event.ctrlKey || event.metaKey) {
    return null;
  }
  if (event.key === 'ArrowLeft') return 'prev';
  if (event.key === 'ArrowRight') return 'next';
  if (event.key === 'Escape') return 'close';
  return null;
}

export function detectHorizontalSwipe(
  start: SwipePoint,
  end: SwipePoint,
  threshold = DEFAULT_SWIPE_THRESHOLD,
): SwipeDirection | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < threshold) {
    return null;
  }
  if (absX <= absY * HORIZONTAL_DOMINANCE_RATIO) {
    return null;
  }
  return dx < 0 ? 'left' : 'right';
}

export function subscribeLightboxKeyboard(
  target: LightboxKeyboardTargetLike,
  handlers: {
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
  },
): () => void {
  const listener = (event: LightboxKeyboardEventLike) => {
    const action = resolveLightboxKeyboardAction(event);
    if (!action) return;
    event.preventDefault();
    if (action === 'prev') {
      handlers.onPrev();
      return;
    }
    if (action === 'next') {
      handlers.onNext();
      return;
    }
    handlers.onClose();
  };

  target.addEventListener('keydown', listener);
  return () => {
    target.removeEventListener('keydown', listener);
  };
}

export function preloadGalleryImages(
  items: readonly PreloadImageDescriptor[],
  preloadedKeys: Set<string>,
  createImage: () => PreloadImageTarget,
): PreloadImageDescriptor[] {
  const loaded: PreloadImageDescriptor[] = [];
  for (const item of items) {
    const src = item.src.trim();
    if (!src) continue;
    const key = `${src}|${item.srcSet ?? ''}|${item.sizes ?? ''}`;
    if (preloadedKeys.has(key)) continue;
    preloadedKeys.add(key);
    const img = createImage();
    if (item.sizes) {
      img.sizes = item.sizes;
    }
    if (item.srcSet) {
      img.srcset = item.srcSet;
    }
    img.src = src;
    loaded.push({ ...item, src });
  }
  return loaded;
}

interface UseGalleryLightboxOptions {
  total: number;
  activeIndex: number | null;
  onChangeIndex: (index: number | null) => void;
  resolvePreloadItem?: (index: number) => PreloadImageDescriptor | null;
  swipeThreshold?: number;
}

export function useGalleryLightbox({
  total,
  activeIndex,
  onChangeIndex,
  resolvePreloadItem,
  swipeThreshold = DEFAULT_SWIPE_THRESHOLD,
}: UseGalleryLightboxOptions) {
  const [direction, setDirection] = useState<'initial' | 'next' | 'prev'>('initial');
  const touchStartRef = useRef<SwipePoint | null>(null);
  const preloadedRef = useRef<Set<string>>(new Set());
  const activeIndexRef = useRef(activeIndex);
  const totalRef = useRef(total);
  const onChangeIndexRef = useRef(onChangeIndex);
  const resolvePreloadRef = useRef(resolvePreloadItem);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
    totalRef.current = total;
    onChangeIndexRef.current = onChangeIndex;
    resolvePreloadRef.current = resolvePreloadItem;
  }, [activeIndex, total, onChangeIndex, resolvePreloadItem]);

  const goStep = useCallback((delta: number) => {
    const current = activeIndexRef.current;
    const count = totalRef.current;
    if (current === null || count <= 1) return;
    const nextIndex = wrapGalleryIndex(current, delta, count);
    if (nextIndex === null) return;
    setDirection(delta >= 0 ? 'next' : 'prev');
    onChangeIndexRef.current(nextIndex);
  }, []);

  const goPrev = useCallback(() => {
    goStep(-1);
  }, [goStep]);

  const goNext = useCallback(() => {
    goStep(1);
  }, [goStep]);

  const close = useCallback(() => {
    touchStartRef.current = null;
    onChangeIndexRef.current(null);
  }, []);

  const isOpen = activeIndex !== null && total > 0;

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    return subscribeLightboxKeyboard(window, {
      onPrev: goPrev,
      onNext: goNext,
      onClose: close,
    });
  }, [isOpen, goPrev, goNext, close]);

  useEffect(() => {
    if (!isOpen || activeIndex === null || typeof window === 'undefined') return;
    const resolver = resolvePreloadRef.current;
    if (!resolver) return;
    const adjacent = getAdjacentGalleryIndices(activeIndex, total);
    const descriptors = adjacent
      .map((index) => resolver(index))
      .filter((item): item is PreloadImageDescriptor => item !== null);
    preloadGalleryImages(descriptors, preloadedRef.current, () => new window.Image());
  }, [isOpen, activeIndex, total]);

  const onTouchStart = useCallback((event: TouchEventLike) => {
    if (event.touches.length !== 1) {
      touchStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const onTouchEnd = useCallback(
    (event: TouchEventLike) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const swipe = detectHorizontalSwipe(
        start,
        { x: touch.clientX, y: touch.clientY },
        swipeThreshold,
      );
      if (swipe === 'left') {
        goNext();
      } else if (swipe === 'right') {
        goPrev();
      }
    },
    [goNext, goPrev, swipeThreshold],
  );

  const onTouchCancel = useCallback(() => {
    touchStartRef.current = null;
  }, []);

  const safeActiveIndex =
    isOpen && activeIndex !== null && activeIndex >= 0 && activeIndex < total
      ? activeIndex
      : null;

  return {
    isOpen,
    hasMultiple: total > 1,
    direction,
    counterLabel: safeActiveIndex !== null ? `${safeActiveIndex + 1} / ${total}` : '',
    goPrev,
    goNext,
    close,
    swipeHandlers: {
      onTouchStart,
      onTouchEnd,
      onTouchCancel,
    },
  };
}
