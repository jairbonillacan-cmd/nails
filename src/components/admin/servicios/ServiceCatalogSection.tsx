'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { CalendarDays, Check, Copy, Lock, Scissors, Search } from 'lucide-react';
import {
  ActionRow,
  EmptyStateCard,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
  type FilterPillOption,
} from '@/components/ui';
import {
  formatServicePriceLabel,
  ServiceThumbnail,
} from '@/components/admin/servicios/ServiceThumbnail';
import { agendaHref } from '@/lib/admin-links';
import { useCopyToClipboard } from '@/lib/hooks/useCopyToClipboard';
import { formatDuration } from '@/lib/format';
import type { Service, ServiceCategory } from '@/lib/types';

interface ServiceCatalogSectionProps {
  services: Service[];
  categories: ServiceCategory[];
  categoryNameById: ReadonlyMap<string, string>;
  currency: 'MXN' | 'USD';
  selectedServiceId: string | undefined;
  initialSearch?: string;
  togglingId: string | null;
  onSelectService: (srv: Service) => void;
  onRequestToggleActive: (srv: Service, checked: boolean) => void;
  onCopyError: (message: string) => void;
}

export function ServiceCatalogSection({
  services,
  categories,
  categoryNameById,
  currency,
  selectedServiceId,
  initialSearch = '',
  togglingId,
  onSelectService,
  onRequestToggleActive,
  onCopyError,
}: ServiceCatalogSectionProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const clipboard = useCopyToClipboard(2400);

  const privateServicesCount = services.filter((s) => s.isPrivate).length;
  const categoryFilterOptions: FilterPillOption<string>[] = [
    { value: 'all', label: 'Todos', count: services.length },
    ...categories.map((cat) => ({ value: cat.id, label: cat.name })),
    ...(privateServicesCount > 0
      ? [
          {
            value: 'vip',
            label: 'Solo link',
            count: privateServicesCount,
            icon: <Lock size={12} aria-hidden="true" />,
          },
        ]
      : []),
  ];

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredServices = services.filter((srv) => {
    if (categoryFilter === 'vip' && !srv.isPrivate) return false;
    if (
      categoryFilter !== 'all' &&
      categoryFilter !== 'vip' &&
      srv.categoryId !== categoryFilter
    ) {
      return false;
    }
    if (!normalizedQuery) return true;
    const catLabel = srv.categoryId ? (categoryNameById.get(srv.categoryId) ?? '') : '';
    return (
      srv.name.toLowerCase().includes(normalizedQuery) ||
      srv.slug.toLowerCase().includes(normalizedQuery) ||
      srv.description.toLowerCase().includes(normalizedQuery) ||
      catLabel.toLowerCase().includes(normalizedQuery)
    );
  });

  const copyServiceLink = async (slug: string) => {
    const url = `${window.location.origin}/reservar/${slug}`;
    setCopiedSlug(slug);
    const ok = await clipboard.copy(
      url,
      `Link directo copiado: /reservar/${slug}`,
      `No se pudo copiar automáticamente. Usa /reservar/${slug}`,
    );
    if (!ok) {
      onCopyError(`No se pudo copiar automáticamente. Usa /reservar/${slug}`);
    }
  };

  return (
    <SurfaceCard
      id="services-catalog-heading"
      title="Menú de servicios"
      subtitle="Toca un servicio para editarlo o copia su link directo para enviarlo por mensaje."
      count={filteredServices.length}
    >
      <Text
        type="supporting"
        color="secondary"
        role="status"
        aria-live="polite"
        className="rb-sr-only"
      >
        {clipboard.feedback ?? ''}
      </Text>

      <HStack className="ad-toolbar" justify="between" align="center" gap={2} wrap="wrap">
        <FilterPillBar
          ariaLabel="Filtrar por categoría"
          value={categoryFilter}
          options={categoryFilterOptions}
          onChange={setCategoryFilter}
          size="sm"
        />
        <VStack maxWidth={220} width="100%">
          <TextInput
            label="Buscar servicio"
            isLabelHidden
            size="sm"
            placeholder="Buscar servicio..."
            value={searchQuery}
            onChange={setSearchQuery}
            startIcon={<Search size={14} aria-hidden="true" />}
          />
        </VStack>
      </HStack>

      {filteredServices.length === 0 ? (
        <VStack className="ad-empty" gap={2}>
          <EmptyStateCard
            framed={false}
            isCompact
            icon={<Scissors size={22} aria-hidden="true" />}
            title="No encontramos servicios con ese filtro"
            description="Prueba otra categoría, borra la búsqueda o crea un servicio nuevo."
            actions={
              <Button
                type="button"
                label="Ver todos"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setCategoryFilter('all');
                  setSearchQuery('');
                }}
              />
            }
          />
        </VStack>
      ) : (
        <VStack as="ul" className="ad-row-list" gap={0}>
          {filteredServices.map((srv) => {
            const categoryName = srv.categoryId ? categoryNameById.get(srv.categoryId) : null;
            const isSelectedRow = selectedServiceId === srv.id;
            const isCopiedRow = copiedSlug === srv.slug && clipboard.copied;
            const cleanupMinutes = srv.bufferBeforeMinutes + srv.bufferAfterMinutes;
            const metaParts = [
              formatDuration(srv.durationMinutes),
              categoryName,
              cleanupMinutes > 0 ? `+${cleanupMinutes} min limpieza` : null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <li
                key={srv.id}
                className={togglingId === srv.id ? 'fx-busy' : undefined}
                aria-busy={togglingId === srv.id || undefined}
              >
                <ActionRow
                  leading={<ServiceThumbnail slug={srv.slug} imageUrl={srv.imageUrl} />}
                  title={
                    <HStack gap={1.5} align="center" wrap="wrap">
                      <Text weight="semibold" size="base">
                        {srv.name}
                      </Text>
                      {srv.isPrivate ? (
                        <StatusTag
                          label="Solo link privado"
                          tone="accent"
                          icon={<Lock size={11} aria-hidden="true" />}
                        />
                      ) : null}
                      {!srv.isActive ? <StatusTag label="Pausado" tone="neutral" /> : null}
                    </HStack>
                  }
                  meta={metaParts}
                  isSelected={isSelectedRow}
                  isMuted={!srv.isActive}
                  onClick={() => onSelectService(srv)}
                  status={
                    <Text weight="bold" size="base" className="fx-tabular" hasTabularNumbers>
                      {formatServicePriceLabel(srv.priceCents, srv.isStartingPrice, currency)}
                    </Text>
                  }
                  actions={
                    <HStack gap={1.5} align="center" wrap="wrap">
                      <Button
                        label="Ver citas"
                        variant="ghost"
                        size="sm"
                        icon={<CalendarDays size={13} aria-hidden="true" />}
                        href={agendaHref({ q: srv.name })}
                      />
                      <Button
                        type="button"
                        label={isCopiedRow ? 'Copiado' : 'Copiar link'}
                        variant="ghost"
                        size="sm"
                        icon={
                          isCopiedRow ? (
                            <Check size={13} aria-hidden="true" className="fx-pop" />
                          ) : (
                            <Copy size={13} aria-hidden="true" />
                          )
                        }
                        onClick={() => void copyServiceLink(srv.slug)}
                      />
                      <Switch
                        label="Visible"
                        size="sm"
                        value={srv.isActive}
                        isLoading={togglingId === srv.id}
                        onChange={(checked) => onRequestToggleActive(srv, checked)}
                      />
                    </HStack>
                  }
                />
              </li>
            );
          })}
        </VStack>
      )}
    </SurfaceCard>
  );
}
