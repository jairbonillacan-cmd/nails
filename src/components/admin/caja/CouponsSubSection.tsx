'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { Switch } from '@astryxdesign/core/Switch';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Table, pixel, proportional } from '@astryxdesign/core/Table';
import { Check, Copy, Gift, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { formatCurrency, formatDateShortInTimezone } from '@/lib/format';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import type { Coupon } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { EmptyStateCard, FilterPillBar, StatusTag, SurfaceCard } from '@/components/ui';
import {
  COUPON_LIST_FILTER_OPTIONS,
  classifyCouponStatus,
  filterCoupons,
  type CouponListFilter,
  type CouponPayloadData,
} from './cajaMetrics';
import { CouponEditorDialog } from './CouponEditorDialog';

interface CouponsSubSectionProps {
  coupons: readonly Coupon[];
  currency: 'MXN' | 'USD';
  tz: string;
  todayKey: string;
  nowMs: number;
  canManageCoupons?: boolean;
  togglingCouponId: string | null;
  deletingCouponId: string | null;
  onSaveCoupon: (data: CouponPayloadData) => Promise<FormSubmitResult>;
  onToggleCouponActive: (coupon: Coupon, nextActive: boolean) => Promise<void>;
  onRequestDeleteCoupon: (coupon: Coupon) => void;
}

export function CouponsSubSection({
  coupons,
  currency,
  tz,
  todayKey,
  nowMs,
  canManageCoupons = true,
  togglingCouponId,
  deletingCouponId,
  onSaveCoupon,
  onToggleCouponActive,
  onRequestDeleteCoupon,
}: CouponsSubSectionProps) {
  const clipboard = useCopyToClipboard(2000);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [listFilter, setListFilter] = useState<CouponListFilter>('all');
  const [query, setQuery] = useState('');
  const visibleCoupons = useMemo(
    () => filterCoupons(coupons, { filter: listFilter, query, nowMs }),
    [coupons, listFilter, query, nowMs],
  );
  const existingCodes = useMemo(() => coupons.map((c) => c.code), [coupons]);

  const handleCopyCode = async (coupon: Coupon) => {
    setCopiedId(coupon.id);
    await clipboard.copy(coupon.code, `Código ${coupon.code} copiado.`);
  };

  const handleOpenCreate = () => {
    setEditingCoupon(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setEditorOpen(true);
  };

  const activeCount = coupons.filter(
    (coupon) => classifyCouponStatus(coupon, nowMs).status === 'active',
  ).length;

  return (
    <>
      <VStack gap={0}>
        <SurfaceCard
          title="Cupones y tarjetas de regalo"
          subtitle="Códigos de descuento y tarjetas con saldo que tus clientas pueden usar al agendar."
          count={coupons.length}
          badge={
            coupons.length > 0 ? (
              <StatusTag
                tone="success"
                hasTabularNumbers
                label={`${activeCount} ${activeCount === 1 ? 'activo' : 'activos'}`}
              />
            ) : undefined
          }
          actions={
            canManageCoupons ? (
              <Button
                type="button"
                label="Crear código"
                variant="secondary"
                size="sm"
                icon={<Plus size={14} aria-hidden="true" />}
                onClick={handleOpenCreate}
              />
            ) : undefined
          }
        >
          {coupons.length === 0 ? (
            <VStack padding={4}>
              <EmptyStateCard
                framed={false}
                isCompact
                title="Sin cupones activos"
                description="Usa el botón Crear código para hacer el primero."
              />
            </VStack>
          ) : (
            <>
              <VStack className="ad-caja-list-toolbar" gap={2}>
                <TextInput
                  type="search"
                  size="sm"
                  label="Buscar código"
                  isLabelHidden
                  placeholder="Buscar código o destinataria..."
                  value={query}
                  onChange={setQuery}
                  startIcon={<Search size={14} aria-hidden="true" />}
                  hasClear
                />
                <FilterPillBar
                  ariaLabel="Filtrar cupones y tarjetas"
                  mode="pills"
                  size="sm"
                  value={listFilter}
                  options={COUPON_LIST_FILTER_OPTIONS}
                  onChange={setListFilter}
                />
              </VStack>
              {visibleCoupons.length === 0 ? (
                <VStack padding={4}>
                  <EmptyStateCard
                    framed={false}
                    isCompact
                    title="Sin códigos con este filtro"
                    description="Cambia la búsqueda o el filtro para ver otros códigos."
                    actions={
                      <Button
                        type="button"
                        label="Ver todos"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setListFilter('all');
                          setQuery('');
                        }}
                      />
                    }
                  />
                </VStack>
              ) : null}
              <VStack
                className="ad-table-scroll ad-caja-desktop-table"
                gap={0}
                hidden={visibleCoupons.length === 0}
              >
                <Table
                  idKey="id"
                  hasHover
                  data={visibleCoupons}
                  columns={[
                    {
                      key: 'code',
                      header: 'Código',
                      width: proportional(1.5, { minWidth: 165 }),
                      renderCell: (c) => {
                        const isCopied = clipboard.copied && copiedId === c.id;
                        const metaParts: string[] = [];
                        if (c.recipientName) metaParts.push(`Para ${c.recipientName}`);
                        if (c.expiresAt) {
                          metaParts.push(`Vence ${formatDateShortInTimezone(c.expiresAt, tz)}`);
                        }
                        return (
                          <VStack gap={0.5} className="ad-coupon-code-cell">
                            <HStack gap={1.5} align="center">
                              <Gift size={14} aria-hidden="true" className="ad-coupon-icon" />
                              <Text type="code" weight="semibold">
                                {c.code}
                              </Text>
                              <IconButton
                                type="button"
                                size="sm"
                                variant="ghost"
                                label={isCopied ? 'Código copiado' : `Copiar código ${c.code}`}
                                tooltip={isCopied ? 'Copiado' : 'Copiar código'}
                                icon={
                                  isCopied ? (
                                    <Check size={13} aria-hidden="true" />
                                  ) : (
                                    <Copy size={13} aria-hidden="true" />
                                  )
                                }
                                onClick={() => void handleCopyCode(c)}
                              />
                            </HStack>
                            {metaParts.length > 0 ? (
                              <Text type="supporting" color="secondary">
                                {metaParts.join(' · ')}
                              </Text>
                            ) : null}
                          </VStack>
                        );
                      },
                    },
                    {
                      key: 'kind',
                      header: 'Tipo',
                      width: pixel(135),
                      renderCell: (c) => (
                        <StatusTag
                          tone={c.kind === 'gift_card' ? 'accent' : 'neutral'}
                          label={c.kind === 'gift_card' ? 'Tarjeta de regalo' : 'Cupón'}
                        />
                      ),
                    },
                    {
                      key: 'isActive',
                      header: 'Estado',
                      width: pixel(100),
                      renderCell: (c) => {
                        const meta = classifyCouponStatus(c, nowMs);
                        return <StatusTag tone={meta.tone} showDot label={meta.label} />;
                      },
                    },
                    {
                      key: 'discountValue',
                      header: 'Beneficio / Saldo',
                      width: proportional(1.2, { minWidth: 145 }),
                      renderCell: (c) => {
                        if (c.kind === 'gift_card') {
                          const remaining = c.remainingBalanceCents ?? 0;
                          const initial = Math.max(c.discountValue, remaining, 1);
                          const pct = Math.max(
                            0,
                            Math.min(100, Math.round((remaining / initial) * 100)),
                          );
                          return (
                            <VStack gap={1} className="ad-coupon-progress-cell">
                              <HStack justify="between" align="center" gap={2}>
                                <Text weight="semibold" hasTabularNumbers>
                                  {formatCurrency(remaining, currency)}
                                </Text>
                                <Text type="supporting" color="secondary" hasTabularNumbers>
                                  de {formatCurrency(c.discountValue, currency)}
                                </Text>
                              </HStack>
                              <VStack className="ad-thin-track" gap={0} aria-hidden="true">
                                <VStack
                                  className="ad-thin-fill"
                                  data-accent={remaining > 0 ? 'true' : undefined}
                                  gap={0}
                                  style={{ width: `${pct}%` }}
                                />
                              </VStack>
                            </VStack>
                          );
                        }
                        return (
                          <VStack gap={0}>
                            <Text weight="semibold" hasTabularNumbers>
                              {c.discountType === 'percent'
                                ? `${c.discountValue}% de descuento`
                                : formatCurrency(c.discountValue, currency)}
                            </Text>
                            {c.minSubtotalCents > 0 ? (
                              <Text type="supporting" color="secondary" hasTabularNumbers>
                                Mínimo {formatCurrency(c.minSubtotalCents, currency)}
                              </Text>
                            ) : null}
                          </VStack>
                        );
                      },
                    },
                    {
                      key: 'usedCount',
                      header: 'Uso',
                      width: pixel(96),
                      renderCell: (c) => {
                        if (!c.maxUses) {
                          return (
                            <Text hasTabularNumbers>
                              {c.usedCount} {c.usedCount === 1 ? 'uso' : 'usos'}
                            </Text>
                          );
                        }
                        const pct = Math.max(
                          0,
                          Math.min(100, Math.round((c.usedCount / c.maxUses) * 100)),
                        );
                        return (
                          <VStack gap={1} className="ad-coupon-usage-cell">
                            <Text type="supporting" weight="medium" hasTabularNumbers>
                              {c.usedCount} / {c.maxUses}
                            </Text>
                            <VStack className="ad-thin-track" gap={0} aria-hidden="true">
                              <VStack
                                className="ad-thin-fill"
                                data-accent={pct >= 80 ? 'true' : undefined}
                                gap={0}
                                style={{ width: `${pct}%` }}
                              />
                            </VStack>
                          </VStack>
                        );
                      },
                    },
                    ...(canManageCoupons
                      ? [
                          {
                            key: 'id' as const,
                            header: 'Acciones',
                            align: 'end' as const,
                            width: pixel(256),
                            renderCell: (c: Coupon) => {
                              const isBusy =
                                togglingCouponId === c.id || deletingCouponId === c.id;
                              return (
                                <HStack
                                  gap={1.5}
                                  align="center"
                                  justify="end"
                                  className="ad-caja-row-actions"
                                >
                                  <Switch
                                    label={
                                      c.isActive
                                        ? `Pausar código ${c.code}`
                                        : `Activar código ${c.code}`
                                    }
                                    isLabelHidden
                                    size="sm"
                                    value={c.isActive}
                                    isDisabled={isBusy}
                                    onChange={(nextVal) =>
                                      void onToggleCouponActive(c, nextVal)
                                    }
                                  />
                                  <Button
                                    type="button"
                                    label="Editar"
                                    variant="ghost"
                                    size="sm"
                                    className="ad-caja-row-btn"
                                    icon={<Pencil size={13} aria-hidden="true" />}
                                    isDisabled={isBusy}
                                    onClick={() => handleOpenEdit(c)}
                                  />
                                  <Button
                                    type="button"
                                    label="Eliminar"
                                    variant="ghost"
                                    size="sm"
                                    className="ad-caja-delete-btn ad-caja-row-btn"
                                    icon={<Trash2 size={13} aria-hidden="true" />}
                                    isLoading={deletingCouponId === c.id}
                                    isDisabled={Boolean(deletingCouponId) || isBusy}
                                    onClick={() => onRequestDeleteCoupon(c)}
                                  />
                                </HStack>
                              );
                            },
                          },
                        ]
                      : []),
                  ]}
                />
              </VStack>

              <VStack className="ad-caja-mobile-cards" gap={3}>
                {visibleCoupons.map((c) => {
                  const meta = classifyCouponStatus(c, nowMs);
                  const isCopied = clipboard.copied && copiedId === c.id;
                  const isBusy = togglingCouponId === c.id || deletingCouponId === c.id;
                  const remaining = c.remainingBalanceCents ?? 0;
                  const initial = Math.max(c.discountValue, remaining, 1);
                  const balancePct = Math.max(
                    0,
                    Math.min(100, Math.round((remaining / initial) * 100)),
                  );
                  const usagePct = c.maxUses
                    ? Math.max(0, Math.min(100, Math.round((c.usedCount / c.maxUses) * 100)))
                    : 0;

                  return (
                    <VStack key={c.id} className="ad-caja-mcard" gap={3}>
                      <HStack justify="between" align="center" gap={2} wrap="wrap">
                        <HStack gap={1.5} align="center">
                          <Gift size={15} aria-hidden="true" className="ad-coupon-icon" />
                          <Text type="code" weight="semibold">
                            {c.code}
                          </Text>
                          <IconButton
                            type="button"
                            size="sm"
                            variant="ghost"
                            label={isCopied ? 'Código copiado' : `Copiar código ${c.code}`}
                            icon={
                              isCopied ? (
                                <Check size={14} aria-hidden="true" />
                              ) : (
                                <Copy size={14} aria-hidden="true" />
                              )
                            }
                            onClick={() => void handleCopyCode(c)}
                          />
                        </HStack>
                        <StatusTag tone={meta.tone} showDot label={meta.label} />
                      </HStack>

                      <HStack justify="between" align="center" gap={2} wrap="wrap">
                        <StatusTag
                          tone={c.kind === 'gift_card' ? 'accent' : 'neutral'}
                          label={c.kind === 'gift_card' ? 'Tarjeta de regalo' : 'Cupón'}
                        />
                        <Text weight="bold" hasTabularNumbers>
                          {c.kind === 'gift_card'
                            ? `${formatCurrency(remaining, currency)} / ${formatCurrency(c.discountValue, currency)}`
                            : c.discountType === 'percent'
                              ? `${c.discountValue}% de descuento`
                              : formatCurrency(c.discountValue, currency)}
                        </Text>
                      </HStack>

                      {c.kind === 'gift_card' ? (
                        <VStack className="ad-thin-track" gap={0} aria-hidden="true">
                          <VStack
                            className="ad-thin-fill"
                            data-accent={remaining > 0 ? 'true' : undefined}
                            gap={0}
                            style={{ width: `${balancePct}%` }}
                          />
                        </VStack>
                      ) : null}

                      <VStack gap={1}>
                        <HStack justify="between" align="center" gap={2}>
                          <Text type="supporting" color="secondary">
                            Usos
                          </Text>
                          <Text type="supporting" weight="medium" hasTabularNumbers>
                            {c.maxUses
                              ? `${c.usedCount} / ${c.maxUses}`
                              : `${c.usedCount} ${c.usedCount === 1 ? 'uso' : 'usos'}`}
                          </Text>
                        </HStack>
                        {c.maxUses ? (
                          <VStack className="ad-thin-track" gap={0} aria-hidden="true">
                            <VStack
                              className="ad-thin-fill"
                              data-accent={usagePct >= 80 ? 'true' : undefined}
                              gap={0}
                              style={{ width: `${usagePct}%` }}
                            />
                          </VStack>
                        ) : null}
                        {c.minSubtotalCents > 0 || c.recipientName || c.expiresAt ? (
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {[
                              c.minSubtotalCents > 0
                                ? `Mínimo ${formatCurrency(c.minSubtotalCents, currency)}`
                                : null,
                              c.recipientName ? `Para ${c.recipientName}` : null,
                              c.expiresAt
                                ? `Vence ${formatDateShortInTimezone(c.expiresAt, tz)}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        ) : null}
                      </VStack>

                      {canManageCoupons ? (
                        <HStack
                          justify="between"
                          align="center"
                          gap={2}
                          wrap="wrap"
                          className="ad-caja-mcard-foot"
                        >
                          <Switch
                            label={c.isActive ? 'Activo' : 'Pausado'}
                            size="sm"
                            value={c.isActive}
                            isDisabled={isBusy}
                            onChange={(nextVal) => void onToggleCouponActive(c, nextVal)}
                          />
                          <HStack gap={2} align="center">
                            <Button
                              type="button"
                              label="Editar"
                              variant="secondary"
                              size="sm"
                              className="ad-caja-touch-btn"
                              icon={<Pencil size={14} aria-hidden="true" />}
                              isDisabled={isBusy}
                              onClick={() => handleOpenEdit(c)}
                            />
                            <Button
                              type="button"
                              label="Eliminar"
                              variant="ghost"
                              size="sm"
                              className="ad-caja-delete-btn ad-caja-touch-btn"
                              icon={<Trash2 size={14} aria-hidden="true" />}
                              isLoading={deletingCouponId === c.id}
                              isDisabled={Boolean(deletingCouponId) || isBusy}
                              onClick={() => onRequestDeleteCoupon(c)}
                            />
                          </HStack>
                        </HStack>
                      ) : null}
                    </VStack>
                  );
                })}
              </VStack>
            </>
          )}
        </SurfaceCard>
      </VStack>

      <CouponEditorDialog
        isOpen={editorOpen}
        coupon={editingCoupon}
        existingCodes={existingCodes}
        todayKey={todayKey}
        currency={currency}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingCoupon(null);
        }}
        onSaveCoupon={onSaveCoupon}
      />
    </>
  );
}
