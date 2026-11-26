'use client';

import { createElement, useId, type ReactNode } from 'react';
import { BRAND_ICONS, type BrandIconName, type BrandIconNode } from '@/lib/brand-icons';

interface BrandIconProps {
  name: BrandIconName;
  size?: number;
  label?: string;
  className?: string;
}

function resolveRef(value: string, prefix: string): string {
  if (value === 'url(#L)') return `url(#${prefix}L)`;
  if (value === 'url(#W)') return `url(#${prefix}W)`;
  if (value === 'url(#M)') return `url(#${prefix}M)`;
  return value;
}

function renderNodes(nodes: readonly BrandIconNode[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const props: Record<string, string | number> = { key: index };
    for (const [key, value] of Object.entries(node.a)) {
      props[key] = key === 'id' ? `${prefix}${value}` : resolveRef(value, prefix);
    }
    return createElement(node.t, props, node.c ? renderNodes(node.c, prefix) : undefined);
  });
}

export function BrandIcon({ name, size = 1.5, label, className }: BrandIconProps) {
  const prefix = `ic${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg
      viewBox="0 0 32 32"
      className={className ? `lk-ic ${className}` : 'lk-ic'}
      style={{ width: `${size}rem`, height: `${size}rem` }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={`${prefix}L`} x1="18%" y1="2%" x2="81%" y2="95%">
          <stop offset="0" className="lk-ic-l0" />
          <stop offset=".43" className="lk-ic-l1" />
          <stop offset="1" className="lk-ic-l2" />
        </linearGradient>
        <linearGradient id={`${prefix}W`} x2="1" y2="1">
          <stop offset="0" className="lk-ic-w0" />
          <stop offset="1" className="lk-ic-w1" />
        </linearGradient>
      </defs>
      {renderNodes(BRAND_ICONS[name], prefix)}
    </svg>
  );
}
