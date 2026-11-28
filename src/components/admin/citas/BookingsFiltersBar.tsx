'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Search,
  X,
} from 'lucide-react';
import { FilterPillBar } from '@/components/ui';
import type { AgendaStatusParam, AgendaViewParam } from '@/lib/admin-links';
import { formatCurrency, formatDateShortInTimezone } from '@/lib/format';
import type { StaffMember } from '@/lib/types';
import { shiftDateKey } from './scheduleGridGeometry';

interface AgendaToolbarProps {
  resolvedView: AgendaViewParam | null;
  dateKey: string;
  todayKey: string;
  timezone: string;
  selectedStaffFilter: string;
  search: string;
  isSpecialistOnly: boolean;
  visibleStaff: StaffMember[];
  allStaffColorIndex: ReadonlyMap<string, number>;
  onChangeView: (view: AgendaViewParam) => void;
  onChangeDate: (nextDateKey: string) => void;
  onChangeStaffFilter: (staffId: string) => void;
  onChangeSearch: (value: string) => void;
}

export function AgendaToolbar({
  resolvedView,
  dateKey,
  todayKey,
  timezone,
  selectedStaffFilter,
  search,
  isSpecialistOnly,
  visibleStaff,
  allStaffColorIndex,
  onChangeView,
  onChangeDate,
  onChangeStaffFilter,
  onChangeSearch,
}: AgendaToolbarProps) {
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const isMobileSearchExpanded = mobileSearchOpen || Boolean(search.trim());
  const isWeekView = resolvedView === 'week';
  const stepDays = isWeekView ? 7 : 1;
  const isToday = dateKey === todayKey;

  const formattedDay = dateKey
    ? formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)
    : 'Hoy';
  const formattedWeekRange = dateKey
    ? `${formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)} – ${formatDateShortInTimezone(`${shiftDateKey(dateKey, 6)}T18:00:00Z`, timezone)}`
    : 'Semana';
  const dateButtonLabel = isWeekView
    ? formattedWeekRange
    : isToday
      ? 'Hoy'
      : formattedDay;

  const showStaffSelect = !isSpecialistOnly && visibleStaff.length > 1;

  return (
    <VStack className="ad-agenda-toolbar" gap={1.5}>
      <HStack className="ad-agenda-toolbar-row" align="center" justify="between" gap={2}>
        <HStack className="ad-agenda-date-nav" align="center" gap={1}>
          <Button
            type="button"
            label={isWeekView ? 'Semana anterior' : 'Día anterior'}
            isIconOnly
            size="sm"
            variant="secondary"
            icon={<ChevronLeft size={15} aria-hidden="true" />}
            onClick={() => onChangeDate(shiftDateKey(dateKey, -stepDays))}
          />
          <Button
            type="button"
            label={dateButtonLabel}
            size="sm"
            variant={isToday && !isWeekView ? 'secondary' : 'ghost'}
            onClick={() => onChangeDate(todayKey)}
          />
          <Button
            type="button"
            label={isWeekView ? 'Semana siguiente' : 'Día siguiente'}
            isIconOnly
            size="sm"
            variant="secondary"
            icon={<ChevronRight size={15} aria-hidden="true" />}
            onClick={() => onChangeDate(shiftDateKey(dateKey, stepDays))}
          />
        </HStack>

        <FilterPillBar<AgendaViewParam | ''>
          ariaLabel="Vista de agenda"
          mode="segmented"
          size="sm"
          className="ad-agenda-view-switch"
          value={resolvedView ?? ''}
          onChange={(next) => {
            if (next === 'day' || next === 'week' || next === 'list') {
              onChangeView(next);
            }
          }}
          options={[
            { value: 'day', label: 'Día' },
            { value: 'week', label: 'Semana' },
            { value: 'list', label: 'Lista' },
          ]}
        />

        {showStaffSelect ? (
          <VStack className="ad-agenda-staff-select" gap={0}>
            <Selector
              label="Profesional"
              isLabelHidden
              size="sm"
              width="100%"
              value={selectedStaffFilter}
              onChange={(next) => onChangeStaffFilter(next ?? 'all')}
              options={[
                {
                  value: 'all',
                  label: 'Todas las profesionales',
                  icon: (
                    <Text className="ad-dot" data-idx="all" aria-hidden="true">
                      {'\u200B'}
                    </Text>
                  ),
                },
                ...visibleStaff.map((st) => ({
                  value: st.id,
                  label: st.name,
                  icon: (
                    <Text
                      className="ad-dot"
                      data-idx={String(allStaffColorIndex.get(st.id) ?? 0)}
                      aria-hidden="true"
                    >
                      {'\u200B'}
                    </Text>
                  ),
                })),
              ]}
            />
          </VStack>
        ) : null}

        <VStack className="ad-agenda-search-desktop" gap={0}>
          <TextInput
            type="search"
            label="Buscar cita"
            isLabelHidden
            placeholder="Buscar clienta o código..."
            startIcon={<Search size={14} aria-hidden="true" />}
            size="sm"
            width="100%"
            hasClear
            autoCapitalize="none"
            hasAutoCorrect={false}
            hasSpellCheck={false}
            enterKeyHint="search"
            value={search}
            onChange={onChangeSearch}
          />
        </VStack>

        <Button
          type="button"
          className="ad-agenda-search-toggle"
          label={isMobileSearchExpanded ? 'Cerrar búsqueda' : 'Buscar cita'}
          isIconOnly
          size="sm"
          variant={isMobileSearchExpanded ? 'primary' : 'secondary'}
          icon={
            isMobileSearchExpanded ? (
              <X size={16} aria-hidden="true" />
            ) : (
              <Search size={16} aria-hidden="true" />
            )
          }
          onClick={() => {
            if (isMobileSearchExpanded) {
              onChangeSearch('');
              setMobileSearchOpen(false);
            } else {
              setMobileSearchOpen(true);
            }
          }}
        />
      </HStack>

      {isMobileSearchExpanded ? (
        <VStack className="ad-agenda-search ad-agenda-mobile-only" gap={0}>
          <TextInput
            type="search"
            label="Buscar cita"
            isLabelHidden
            placeholder="Buscar clienta, servicio o código..."
            startIcon={<Search size={14} aria-hidden="true" />}
            size="sm"
            width="100%"
            hasClear
            autoCapitalize="none"
            hasAutoCorrect={false}
            hasSpellCheck={false}
            enterKeyHint="search"
            value={search}
            onChange={onChangeSearch}
          />
        </VStack>
      ) : null}
    </VStack>
  );
}

interface AgendaStatusChipsProps {
  status: AgendaStatusParam;
  pendingCount: number;
  uncollectedCount: number;
  uncollectedTotalCents: number;
  currency: 'MXN' | 'USD';
  todayWaitingCount: number;
  totalWaitingCount: number;
  waitlistOpen: boolean;
  canViewWaitlist: boolean;
  onChangeStatus: (nextStatus: AgendaStatusParam) => void;
  onToggleWaitlist: () => void;
}

interface StatusChipDef {
  readonly value: AgendaStatusParam;
  readonly label: string;
  readonly countText?: string;
  readonly tone?: 'warning' | 'accent';
}

export function AgendaStatusChips({
  status,
  pendingCount,
  uncollectedCount,
  uncollectedTotalCents,
  currency,
  todayWaitingCount,
  totalWaitingCount,
  waitlistOpen,
  canViewWaitlist,
  onChangeStatus,
  onToggleWaitlist,
}: AgendaStatusChipsProps) {
  const uncollectedSummary =
    uncollectedCount > 0
      ? uncollectedTotalCents > 0
        ? `${uncollectedCount} · ${formatCurrency(uncollectedTotalCents, currency)}`
        : String(uncollectedCount)
      : undefined;

  const chips: readonly StatusChipDef[] = [
    { value: 'upcoming', label: 'Próximas' },
    {
      value: 'pending',
      label: 'Por confirmar',
      countText: pendingCount > 0 ? String(pendingCount) : undefined,
      tone: pendingCount > 0 ? 'warning' : undefined,
    },
    {
      value: 'uncollected',
      label: 'Por cobrar',
      countText: uncollectedSummary,
      tone: uncollectedCount > 0 ? 'accent' : undefined,
    },
    { value: 'past', label: 'Pasadas' },
    { value: 'canceled', label: 'Canceladas' },
  ];

  const waitlistLabel =
    totalWaitingCount > 0 ? `${totalWaitingCount} en espera` : 'Lista de espera';
  const waitlistTitle =
    todayWaitingCount > 0
      ? `${totalWaitingCount} en espera (${todayWaitingCount} para esta fecha/hoy)`
      : 'Abrir panel de lista de espera';

  return (
    <nav aria-label="Filtros de estado de agenda" className="ad-agenda-chips">
      {chips.map((chip) => {
        const isActive =
          status === chip.value ||
          (chip.value === 'past' && status === 'completed');
        return (
          <button
            key={chip.value}
            type="button"
            className="ad-agenda-chip"
            data-active={isActive ? 'true' : undefined}
            data-tone={chip.tone}
            aria-pressed={isActive}
            onClick={() => onChangeStatus(chip.value)}
          >
            {chip.label}
            {chip.countText ? (
              <Text className="ad-agenda-chip-count" hasTabularNumbers>
                {chip.countText}
              </Text>
            ) : null}
          </button>
        );
      })}

      {canViewWaitlist ? (
        <button
          type="button"
          className="ad-agenda-waitlist-chip"
          data-active={waitlistOpen ? 'true' : undefined}
          aria-pressed={waitlistOpen}
          title={waitlistTitle}
          onClick={onToggleWaitlist}
        >
          <Clock size={13} aria-hidden="true" />
          {waitlistLabel}
        </button>
      ) : null}
    </nav>
  );
}
