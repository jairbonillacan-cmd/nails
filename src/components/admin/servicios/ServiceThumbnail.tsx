'use client';

import type React from 'react';
import Image from 'next/image';
import {
  isOptimizableLocalRasterImage,
  servicePhoto,
} from '@/components/landing/landingContent';
import { formatCurrency } from '@/lib/format';
import type { Service } from '@/lib/types';

export function buildNewServiceDraft(
  defaultDepositCents: number,
  defaultCategoryId: string | null,
): Partial<Service> {
  return {
    categoryId: defaultCategoryId,
    name: '',
    description: '',
    durationMinutes: 120,
    priceCents: 35000,
    isStartingPrice: true,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    requiresConfirmation: true,
    depositRequired: true,
    depositAmountCents: defaultDepositCents,
    allowInspoPhoto: true,
    isActive: true,
    isFeatured: true,
    isPrivate: false,
  };
}

export function isServiceDraftDirty(
  draft: Partial<Service>,
  original: Service | null,
): boolean {
  const trimmedName = (draft.name ?? '').trim();
  if (trimmedName.length < 2) return false;
  if (!original) return true;
  return (
    trimmedName !== original.name.trim() ||
    (draft.categoryId ?? null) !== (original.categoryId ?? null) ||
    (draft.description ?? '').trim() !== original.description.trim() ||
    (draft.durationMinutes ?? original.durationMinutes) !== original.durationMinutes ||
    (draft.priceCents ?? original.priceCents) !== original.priceCents ||
    Boolean(draft.isStartingPrice) !== Boolean(original.isStartingPrice) ||
    (draft.bufferBeforeMinutes ?? 0) !== original.bufferBeforeMinutes ||
    (draft.bufferAfterMinutes ?? 0) !== original.bufferAfterMinutes ||
    Boolean(draft.requiresConfirmation) !== original.requiresConfirmation ||
    Boolean(draft.depositRequired) !== original.depositRequired ||
    (draft.depositAmountCents ?? 0) !== original.depositAmountCents ||
    Boolean(draft.allowInspoPhoto) !== original.allowInspoPhoto ||
    Boolean(draft.isActive) !== original.isActive ||
    Boolean(draft.isPrivate) !== Boolean(original.isPrivate) ||
    (draft.imageUrl ?? null) !== (original.imageUrl ?? null)
  );
}

export function formatServicePriceLabel(
  priceCents: number,
  isStartingPrice: boolean | undefined,
  currency: 'MXN' | 'USD',
): string {
  const formatted = formatCurrency(priceCents, currency);
  return isStartingPrice ? `Desde ${formatted}` : formatted;
}

interface ServiceThumbnailProps {
  slug: string;
  imageUrl: string | null;
  size?: 'row' | 'preview';
}

export function ServiceThumbnail({
  slug,
  imageUrl,
  size = 'row',
}: ServiceThumbnailProps) {
  const src = servicePhoto(slug, imageUrl);
  const usesOptimized = isOptimizableLocalRasterImage(src);
  const dim = size === 'preview' ? '4.5rem' : '3.75rem';
  const style: React.CSSProperties = {
    width: dim,
    height: dim,
    aspectRatio: '1 / 1',
    borderRadius: 'var(--radius-element)',
    objectFit: 'cover',
    flexShrink: 0,
    display: 'block',
    background: 'var(--ad-surface-alt, var(--color-background-muted))',
  };

  if (usesOptimized) {
    return (
      <Image
        src={src}
        alt=""
        width={160}
        height={160}
        sizes={dim}
        loading="lazy"
        decoding="async"
        style={style}
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={160}
      height={160}
      loading="lazy"
      decoding="async"
      style={style}
    />
  );
}
