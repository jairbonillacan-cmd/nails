'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Link } from '@astryxdesign/core/Link';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import {
  ArrowUpDown,
  Cake,
  CalendarPlus,
  MessageCircle,
  RotateCcw,
  Search,
  Star,
} from 'lucide-react';
import {
  buildWhatsAppLink,
  formatBirthdayDisplay,
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
} from '@/lib/format';
import type { computeClientLoyaltySummary } from '@/lib/loyalty/stamps';
import type { ClientProfile } from '@/lib/types';
import {
  ActionRow,
  EmptyStateCard,
  FilterPillBar,
  StatusTag,
  SurfaceCard,
  type FilterPillOption,
} from '@/components/ui';
import {
  buildClientNewBookingUrl,
  type ClientDirectoryFilter,
  type ClientDirectorySort,
  type EnrichedClientMetrics,
} from './clientasMetrics';
import { formatNailTechBadges } from './nailTechProfile';
import {
  formatInstagramDisplay,
  formatInstagramUrl,
  getInitialLetter,
} from './clientasTypes';

type LoyaltySummary = ReturnType<typeof computeClientLoyaltySummary>;

const DIRECTORY_FILTER_OPTIONS: readonly FilterPillOption<ClientDirectoryFilter>[] = [
  { value: 'all', label: 'Todas' },
  { value: 'vip', label: 'Frecuentes / VIP' },
  { value: 'package', label: 'Con paquete' },
  { value: 'near_reward', label: 'Cerca de premio' },
  { value: 'birthday', label: 'Cumpleaños del mes' },
  { value: 'alerts', label: 'Con faltas' },
];

const DIRECTORY_SORT_OPTIONS: Array<{ value: ClientDirectorySort; label: string }> = [
  { value: 'alpha', label: 'Orden: A–Z' },
  { value: 'visits', label: 'Más visitas' },
  { value: 'spent', label: 'Mayor gasto' },
  { value: 'last_visit', label: 'Última visita' },
];

function isDirectorySort(value: string): value is ClientDirectorySort {
  return DIRECTORY_SORT_OPTIONS.some((option) => option.value === value);
}

interface ClientDirectoryTabProps {
  query: string;
  onQueryChange: (next: string) => void;
  filter: ClientDirectoryFilter;
  onFilterChange: (next: ClientDirectoryFilter) => void;
  sort: ClientDirectorySort;
  onSortChange: (next: ClientDirectorySort) => void;
  clients: readonly ClientProfile[];
  metricsByClientId: ReadonlyMap<string, EnrichedClientMetrics>;
  loyaltyByClientId: ReadonlyMap<string, LoyaltySummary>;
  tz: string;
  currency: 'MXN' | 'USD';
  salonName: string;
  canManageClients: boolean;
  onSelectClient: (client: ClientProfile) => void;
  onOpenNewClient: () => void;
}

export function ClientDirectoryTab({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  clients,
  metricsByClientId,
  loyaltyByClientId,
  tz,
  currency,
  salonName,
  canManageClients,
  onSelectClient,
  onOpenNewClient,
}: ClientDirectoryTabProps) {
  const groupedByLetter = useMemo(() => {
    if (sort !== 'alpha') return null;
    const map = new Map<string, ClientProfile[]>();
    for (const client of clients) {
      const letter = getInitialLetter(client.fullName);
      const list = map.get(letter);
      if (list) list.push(client);
      else map.set(letter, [client]);
    }
    return Array.from(map.entries()).toSorted(([a], [b]) => a.localeCompare(b, 'es'));
  }, [clients, sort]);

  const hasActiveFilters =
    query.trim().length > 0 || filter !== 'all' || sort !== 'alpha';

  const handleResetFilters = () => {
    onQueryChange('');
    onFilterChange('all');
    onSortChange('alpha');
  };

  const renderClientRow = (c: ClientProfile) => {
    const metrics = metricsByClientId.get(c.id) ?? null;
    const loyalty = loyaltyByClientId.get(c.id) ?? null;
    const visits = metrics?.completedVisits ?? 0;
    const totalSpentCents = metrics?.totalSpentCents ?? 0;
    const remainingPkgSessions = metrics?.activePackageSessions ?? 0;
    const effectiveNoShows = metrics?.effectiveNoShows ?? c.noShowCount;
    const techBadges = metrics ? formatNailTechBadges(metrics.techProfile) : [];
    const freeNotes = metrics ? metrics.freeNotes : c.notes;
    const newBookingUrl = buildClientNewBookingUrl({
      fullName: c.fullName,
      phoneE164: c.phoneE164,
      usualStaffId: metrics?.usualStaffId,
      instagramHandle: c.instagramHandle,
    });

    return (
      <ActionRow
        key={c.id}
        leading={<Avatar name={c.fullName} size="sm" />}
        title={
          <HStack gap={1.5} align="center" wrap="wrap">
            <Text weight="semibold">{c.fullName}</Text>
            {metrics?.isVip ? (
              <StatusTag
                tone="accent"
                icon={<Star size={11} aria-hidden="true" />}
                label="VIP"
              />
            ) : null}
          </HStack>
        }
        subtitle={
          <HStack gap={2} wrap="wrap" align="center">
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {formatPhoneDisplay(c.phoneE164)}
            </Text>
            {c.instagramHandle ? (
              <Link
                href={formatInstagramUrl(c.instagramHandle)}
                isExternalLink
                type="supporting"
              >
                {formatInstagramDisplay(c.instagramHandle)}
              </Link>
            ) : null}
            {c.birthday ? (
              <HStack gap={1} align="center">
                <Cake size={13} aria-hidden="true" />
                <Text type="supporting" color="secondary">
                  {formatBirthdayDisplay(c.birthday)}
                </Text>
              </HStack>
            ) : null}
            {metrics?.usualStaffName ? (
              <Text type="supporting" color="secondary">
                Con {metrics.usualStaffName}
              </Text>
            ) : null}
          </HStack>
        }
        meta={
          <VStack gap={1.5}>
            <HStack gap={1.5} align="center" wrap="wrap">
              <StatusTag
                tone="neutral"
                hasTabularNumbers
                label={`${visits} ${visits === 1 ? 'visita' : 'visitas'}`}
              />
              {loyalty && loyalty.currentStamps > 0 ? (
                <StatusTag
                  tone={loyalty.isRewardReady ? 'success' : 'accent'}
                  hasTabularNumbers
                  label={`${loyalty.currentStamps}/${loyalty.stampsRequired} sellos`}
                />
              ) : null}
              {remainingPkgSessions > 0 ? (
                <StatusTag
                  tone="accent"
                  hasTabularNumbers
                  label={`${remainingPkgSessions} ses. paquete`}
                />
              ) : null}
              {effectiveNoShows > 0 ? (
                <StatusTag
                  tone={metrics?.hasNoShowAlert ? 'warning' : 'neutral'}
                  hasTabularNumbers
                  label={`Faltó ${effectiveNoShows} ${effectiveNoShows === 1 ? 'vez' : 'veces'}`}
                />
              ) : null}
              {techBadges.map((badge) => (
                <StatusTag key={badge.label} tone={badge.tone} label={badge.label} />
              ))}
            </HStack>
            {freeNotes ? (
              <Text type="supporting" color="secondary" maxLines={1}>
                {freeNotes}
              </Text>
            ) : null}
          </VStack>
        }
        status={
          <VStack gap={0} className="ad-cl-metrics-col">
            <Text weight="bold" hasTabularNumbers>
              {formatCurrency(totalSpentCents, currency)}
            </Text>
            <Text type="supporting" color="secondary" hasTabularNumbers>
              {metrics?.lastVisitAt
                ? `Última: ${formatDateShortInTimezone(metrics.lastVisitAt, tz)}`
                : 'Sin visitas'}
            </Text>
          </VStack>
        }
        actions={
          <HStack gap={1.5} align="center" wrap="wrap" className="ad-cl-row-actions">
            <Button
              label="Agendar"
              size="sm"
              variant="primary"
              className="ad-cl-touch-btn"
              icon={<CalendarPlus size={14} aria-hidden="true" />}
              href={newBookingUrl}
            />
            <Button
              type="button"
              label="Ver ficha"
              size="sm"
              variant="secondary"
              className="ad-cl-touch-btn"
              onClick={() => onSelectClient(c)}
            />
            <Button
              label="WhatsApp"
              size="sm"
              variant="ghost"
              className="ad-cl-touch-btn"
              icon={<MessageCircle size={14} aria-hidden="true" />}
              href={buildWhatsAppLink(
                c.phoneE164,
                `¡Hola, ${c.fullName.trim().split(/\s+/)[0] ?? c.fullName}! Te escribimos de ${salonName}.`,
              )}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        }
      />
    );
  };

  return (
    <VStack gap={4} className="fx-step-in">
      <SurfaceCard tone="subtle" padded className="ad-card ad-cl-filter-card">
        <VStack gap={3}>
          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <TextInput
              type="search"
              label="Buscar clienta"
              isLabelHidden
              placeholder="Buscar por nombre, WhatsApp, @instagram o servicio..."
              startIcon={<Search size={14} aria-hidden="true" />}
              size="sm"
              hasClear
              value={query}
              onChange={onQueryChange}
              containerClassName="ad-cl-search"
            />
            <Selector
              label="Ordenar clientas"
              isLabelHidden
              size="sm"
              value={sort}
              startIcon={<ArrowUpDown size={14} aria-hidden="true" />}
              containerClassName="ad-cl-sort"
              onChange={(next) => {
                if (next && isDirectorySort(next)) onSortChange(next);
              }}
              options={DIRECTORY_SORT_OPTIONS}
            />
          </HStack>

          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <FilterPillBar
              ariaLabel="Filtrar clientas"
              mode="pills"
              size="sm"
              value={filter}
              options={DIRECTORY_FILTER_OPTIONS}
              onChange={onFilterChange}
            />
            <HStack gap={2} align="center" wrap="wrap">
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {clients.length} {clients.length === 1 ? 'clienta' : 'clientas'}
              </Text>
              {hasActiveFilters ? (
                <Button
                  type="button"
                  label="Restablecer"
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={13} aria-hidden="true" />}
                  onClick={handleResetFilters}
                />
              ) : null}
            </HStack>
          </HStack>
        </VStack>
      </SurfaceCard>

      {clients.length === 0 ? (
        <EmptyStateCard
          isCompact
          title="No encontramos clientas"
          description="Prueba con otro filtro, nombre o teléfono, o agrega una clienta nueva."
          actions={
            hasActiveFilters || canManageClients ? (
              <HStack gap={2} wrap="wrap" justify="center">
                {hasActiveFilters ? (
                  <Button
                    type="button"
                    label="Ver todas"
                    variant="secondary"
                    size="sm"
                    className="ad-cl-touch-btn"
                    onClick={handleResetFilters}
                  />
                ) : null}
                {canManageClients ? (
                  <Button
                    type="button"
                    label="Nueva clienta"
                    variant="primary"
                    size="sm"
                    className="ad-cl-touch-btn"
                    onClick={onOpenNewClient}
                  />
                ) : null}
              </HStack>
            ) : undefined
          }
        />
      ) : groupedByLetter ? (
        <SurfaceCard>
          {groupedByLetter.map(([letter, clientsInGroup]) => (
            <VStack key={letter} as="section" aria-label={`Clientas con ${letter}`} gap={0}>
              <HStack className="ad-letter-divider" justify="between" align="center">
                <Text weight="semibold" className="lk-serif">
                  {letter}
                </Text>
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  {clientsInGroup.length}
                </Text>
              </HStack>
              <VStack className="ad-row-list" gap={0}>
                {clientsInGroup.map(renderClientRow)}
              </VStack>
            </VStack>
          ))}
        </SurfaceCard>
      ) : (
        <SurfaceCard>
          <VStack className="ad-row-list" gap={0}>
            {clients.map(renderClientRow)}
          </VStack>
        </SurfaceCard>
      )}
    </VStack>
  );
}
