'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { TextInput } from '@astryxdesign/core/TextInput';
import { AlertTriangle, CalendarClock, List as ListIcon, Search } from 'lucide-react';
import { FilterPillBar, StatusTag, SurfaceCard } from '@/components/ui';
import type { BookingWithRelations, StaffMember } from '@/lib/types';

export type AgendaRange = 'today' | 'tomorrow' | 'week';

interface AgendaRangeControlsProps {
  agendaRange: AgendaRange;
  isDateRangeActive: boolean;
  isTodaySelected: boolean;
  isTomorrowSelected: boolean;
  search: string;
  listCount?: number;
  onSelectRange: (range: AgendaRange) => void;
}

export function AgendaRangeControls({
  agendaRange,
  isDateRangeActive,
  isTodaySelected,
  isTomorrowSelected,
  search,
  listCount,
  onSelectRange,
}: AgendaRangeControlsProps) {
  const activeRangeValue: AgendaRange | '' = isTodaySelected
    ? 'today'
    : isTomorrowSelected
      ? 'tomorrow'
      : agendaRange === 'week'
        ? 'week'
        : '';

  if (isDateRangeActive) {
    return (
      <FilterPillBar<AgendaRange | ''>
        ariaLabel="Rango de fechas"
        mode="pills"
        size="sm"
        value={activeRangeValue}
        onChange={(next) => {
          if (next === 'today' || next === 'tomorrow' || next === 'week') {
            onSelectRange(next);
          }
        }}
        options={[
          { value: 'today', label: 'Hoy' },
          { value: 'tomorrow', label: 'Mañana' },
          { value: 'week', label: 'Semana' },
        ]}
      />
    );
  }

  if (search.trim()) {
    return <StatusTag label="Buscando en todas las fechas" tone="neutral" />;
  }

  if (typeof listCount === 'number') {
    return (
      <Text type="supporting" color="secondary" hasTabularNumbers>
        {listCount} {listCount === 1 ? 'cita encontrada' : 'citas encontradas'}
      </Text>
    );
  }

  return null;
}

interface AgendaStaffControlsProps {
  isSpecialistOnly: boolean;
  visibleStaff: StaffMember[];
  allStaffColorIndex: ReadonlyMap<string, number>;
  selectedStaffFilter: string;
  onChangeStaffFilter: (staffId: string) => void;
}

export function AgendaStaffControls({
  isSpecialistOnly,
  visibleStaff,
  allStaffColorIndex,
  selectedStaffFilter,
  onChangeStaffFilter,
}: AgendaStaffControlsProps) {
  if (isSpecialistOnly || visibleStaff.length <= 1) return null;

  return (
    <FilterPillBar<string>
      ariaLabel="Filtrar por profesional"
      mode="pills"
      size="sm"
      value={selectedStaffFilter}
      onChange={onChangeStaffFilter}
      options={[
        {
          value: 'all',
          label: 'Todas',
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
  );
}

interface BookingsFiltersBarProps {
  tab: string;
  viewMode: 'schedule' | 'list';
  agendaRange: AgendaRange;
  selectedStaffFilter: string;
  search: string;
  pendingConfirmationsCount: number;
  waitlistCount: number;
  isDateRangeActive: boolean;
  isTodaySelected: boolean;
  isTomorrowSelected: boolean;
  listCount: number;
  isSpecialistOnly: boolean;
  visibleStaff: StaffMember[];
  allStaffColorIndex: ReadonlyMap<string, number>;
  flaggedBookings: BookingWithRelations[];
  noShowThreshold: number;
  showSecondaryRow?: boolean;
  onChangeTab: (nextTab: string) => void;
  onChangeSearch: (value: string) => void;
  onChangeViewMode: (mode: 'schedule' | 'list') => void;
  onSelectRange: (range: AgendaRange) => void;
  onChangeStaffFilter: (staffId: string) => void;
  onInspectFlaggedBooking: (bookingId: string) => void;
}

export function BookingsFiltersBar({
  tab,
  viewMode,
  agendaRange,
  selectedStaffFilter,
  search,
  pendingConfirmationsCount,
  waitlistCount,
  isDateRangeActive,
  isTodaySelected,
  isTomorrowSelected,
  listCount,
  isSpecialistOnly,
  visibleStaff,
  allStaffColorIndex,
  flaggedBookings,
  noShowThreshold,
  showSecondaryRow = true,
  onChangeTab,
  onChangeSearch,
  onChangeViewMode,
  onSelectRange,
  onChangeStaffFilter,
  onInspectFlaggedBooking,
}: BookingsFiltersBarProps) {
  return (
    <VStack gap={2}>
      {flaggedBookings.length > 0 && tab !== 'waitlist' ? (
        <SurfaceCard tone="warning" padded>
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={2} align="center" wrap="wrap" className="rb-grow">
              <AlertTriangle size={15} aria-hidden="true" />
              <Text size="sm" weight="semibold" hasTabularNumbers>
                Atención: {flaggedBookings.length} cita
                {flaggedBookings.length === 1 ? '' : 's'} de clientas con {noShowThreshold}+
                inasistencias previas (anticipo obligatorio)
              </Text>
            </HStack>
            <HStack gap={1.5} wrap="wrap">
              {flaggedBookings.slice(0, 3).map((bk) => (
                <Button
                  key={bk.id}
                  type="button"
                  size="sm"
                  variant="secondary"
                  label={`${bk.client.fullName} (${bk.client.noShowCount})`}
                  onClick={() => onInspectFlaggedBooking(bk.id)}
                />
              ))}
            </HStack>
          </HStack>
        </SurfaceCard>
      ) : null}

      <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={2}>
        <VStack style={{ minWidth: 0, maxWidth: '100%' }}>
          <TabList value={tab} onChange={onChangeTab}>
            <Tab value="upcoming" label="Próximas" />
            <Tab
              value="unconfirmed"
              label="Por confirmar"
              endContent={
                pendingConfirmationsCount > 0 ? (
                  <Badge variant="neutral" label={String(pendingConfirmationsCount)} />
                ) : undefined
              }
            />
            <Tab value="past" label="Pasadas" />
            <Tab value="canceled" label="Canceladas" />
            <Tab
              value="waitlist"
              label="Lista de espera"
              endContent={
                waitlistCount > 0 ? (
                  <Badge variant="neutral" label={String(waitlistCount)} />
                ) : undefined
              }
            />
          </TabList>
        </VStack>

        <HStack
          gap={2}
          align="center"
          wrap="wrap"
          style={{ flex: '0 1 auto', minWidth: 0, maxWidth: '100%' }}
        >
          <TextInput
            type="search"
            label="Buscar cita"
            isLabelHidden
            placeholder="Buscar clienta o código..."
            startIcon={<Search size={14} aria-hidden="true" />}
            size="sm"
            width="13.5rem"
            containerStyle={{ flex: '1 1 13.5rem', minWidth: 0, maxWidth: '100%' }}
            hasClear
            autoCapitalize="none"
            hasAutoCorrect={false}
            hasSpellCheck={false}
            enterKeyHint="search"
            value={search}
            onChange={onChangeSearch}
          />
          {tab !== 'waitlist' ? (
            <FilterPillBar<'schedule' | 'list'>
              ariaLabel="Vista de agenda"
              mode="segmented"
              size="sm"
              value={viewMode}
              onChange={onChangeViewMode}
              options={[
                { value: 'schedule', label: 'Horario', icon: <CalendarClock size={14} aria-hidden="true" /> },
                { value: 'list', label: 'Lista', icon: <ListIcon size={14} aria-hidden="true" /> },
              ]}
            />
          ) : null}
        </HStack>
      </HStack>

      {tab !== 'waitlist' && showSecondaryRow ? (
        <HStack justify="between" align="center" wrap="wrap" gap={2}>
          <AgendaRangeControls
            agendaRange={agendaRange}
            isDateRangeActive={isDateRangeActive}
            isTodaySelected={isTodaySelected}
            isTomorrowSelected={isTomorrowSelected}
            search={search}
            listCount={listCount}
            onSelectRange={onSelectRange}
          />
          <AgendaStaffControls
            isSpecialistOnly={isSpecialistOnly}
            visibleStaff={visibleStaff}
            allStaffColorIndex={allStaffColorIndex}
            selectedStaffFilter={selectedStaffFilter}
            onChangeStaffFilter={onChangeStaffFilter}
          />
        </HStack>
      ) : null}
    </VStack>
  );
}
