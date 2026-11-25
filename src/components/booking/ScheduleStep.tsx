'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { Calendar, type ISODateString } from '@astryxdesign/core/Calendar';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Divider } from '@astryxdesign/core/Divider';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import {
  ArrowRight,
  Calendar as CalendarIcon,
  Clock,
  Columns3,
  Globe,
  Grid2x2,
  MapPin,
  Tag,
} from 'lucide-react';
import type { AvailableSlot, DayAvailabilitySummary } from '@/lib/availability/engine';
import {
  formatCurrency,
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatDuration,
} from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { BookingLayoutView, ServiceAddon } from '@/lib/types';
import { formatServicePrice, hasConfiguredDeposit } from './bookingHelpers';

interface ScheduleStepProps {
  settings: PublicSettingsDTO;
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServices: PublicServiceDTO[];
  activeSelectedAddons: ServiceAddon[];
  totalDurationMinutes: number;
  subtotalCents: number;
  hasStartingPrice: boolean;
  depositAmountCents: number;
  layoutView: BookingLayoutView;
  timeFormat: '12h' | '24h';
  todayKey: string;
  selectedDate: string;
  availabilityDays: DayAvailabilitySummary[];
  availableDateSet: Set<string>;
  selectedDaySummary: DayAvailabilitySummary | null;
  selectedSlot: AvailableSlot | null;
  highlightedSlotHint?: string;
  loadingAvail: boolean;
  canAdvanceMonth: boolean;
  isViewingFutureWindow: boolean;
  onChangeLayoutView: (view: BookingLayoutView) => void;
  onChangeTimeFormat: (format: '12h' | '24h') => void;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slot: AvailableSlot) => void;
  onRedirectStaff: (staffId: string) => void;
  onAdvanceMonth: () => void;
  onReturnToToday: () => void;
  onOpenWaitlist: () => void;
}

const MONTH_ABBR_ES = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
] as const;

function getMonthBoundaryLabel(
  dayDate: string,
  prevDayDate: string | undefined,
): string | null {
  const parts = dayDate.split('-').map(Number);
  const month = parts[1];
  const day = parts[2];
  if (!month || !day) return null;
  const monthLabel = MONTH_ABBR_ES[month - 1];
  if (!monthLabel) return null;

  if (day === 1) {
    return `${monthLabel} 1`;
  }
  if (prevDayDate) {
    const prevParts = prevDayDate.split('-').map(Number);
    if (prevParts[1] && prevParts[1] !== month) {
      return `${monthLabel} ${day}`;
    }
  }
  return null;
}

export function ScheduleStep({
  settings,
  selectedService,
  selectedExtraServices,
  activeSelectedAddons,
  totalDurationMinutes,
  subtotalCents,
  hasStartingPrice,
  depositAmountCents,
  layoutView,
  timeFormat,
  todayKey,
  selectedDate,
  availabilityDays,
  availableDateSet,
  selectedDaySummary,
  selectedSlot,
  highlightedSlotHint,
  loadingAvail,
  canAdvanceMonth,
  isViewingFutureWindow,
  onChangeLayoutView,
  onChangeTimeFormat,
  onSelectDate,
  onSelectSlot,
  onRedirectStaff,
  onAdvanceMonth,
  onReturnToToday,
  onOpenWaitlist,
}: ScheduleStepProps) {
  const timezone = settings.timezone || 'America/Mexico_City';
  const slots = selectedDaySummary?.slots ?? [];
  const morningSlots = slots.filter((s) => s.period === 'morning');
  const afternoonSlots = slots.filter((s) => s.period === 'afternoon');
  const eveningSlots = slots.filter((s) => s.period === 'evening');

  const selectedDayIdx = availabilityDays.findIndex((d) => d.date === selectedDate);
  const windowStartIdx = selectedDayIdx >= 0 ? selectedDayIdx : 0;
  const weekWindowDays = availabilityDays.slice(windowStartIdx, windowStartIdx + 6);
  const maxDateKey = availabilityDays[availabilityDays.length - 1]?.date;
  const totalRangeSlots = availabilityDays.reduce(
    (sum, day) => sum + day.slotCount,
    0,
  );
  const isRangeEmpty = !loadingAvail && availabilityDays.length > 0 && totalRangeSlots === 0;
  const showDepositInfo = hasConfiguredDeposit(settings, depositAmountCents);

  const redirectStaffId = selectedDaySummary?.redirectStaffId ?? null;
  const redirectStaffName = selectedDaySummary?.redirectStaffName ?? null;
  const publicNote = selectedDaySummary?.publicNote?.trim() || null;

  const renderSlotButton = (slot: AvailableSlot, compact = false) => {
    const visibleLabel = timeFormat === '24h' ? slot.localTime24 : slot.localTime12;
    const isSelected =
      (selectedSlot?.startAt === slot.startAt &&
        selectedSlot?.staffId === slot.staffId) ||
      (!selectedSlot &&
        Boolean(highlightedSlotHint) &&
        (slot.startAt === highlightedSlotHint ||
          slot.localTime24 === highlightedSlotHint));
    const fullDateLabel = formatDateLongInTimezone(slot.startAt, timezone);
    const accessibleLabel = `${visibleLabel}, ${fullDateLabel} (${timezone}) con ${slot.staffName}`;

    return (
      <Button
        key={`${slot.staffId}-${slot.startAt}`}
        label={accessibleLabel}
        aria-label={accessibleLabel}
        variant={isSelected ? 'primary' : 'secondary'}
        size={compact ? 'sm' : 'md'}
        width="100%"
        style={{ fontVariantNumeric: 'tabular-nums' }}
        icon={<StatusDot variant="success" label="Disponible" aria-hidden="true" />}
        onClick={() => onSelectSlot(slot)}
      >
        {visibleLabel}
      </Button>
    );
  };

  const oooBanner =
    publicNote || redirectStaffId ? (
      <Banner
        status="info"
        title={
          publicNote
            ? 'Aviso del salón para esta fecha'
            : 'Especialista con horario alternativo en esta fecha'
        }
        description={
          publicNote ||
          (redirectStaffName
            ? `Te recomendamos revisar los horarios disponibles con ${redirectStaffName}.`
            : 'Consulta otra especialista o prueba otra fecha disponible.')
        }
        endContent={
          redirectStaffId && redirectStaffName ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              label={`Ver horarios de ${redirectStaffName}`}
              onClick={() => onRedirectStaff(redirectStaffId)}
            />
          ) : undefined
        }
      />
    ) : null;

  return (
    <Card padding={5} elevation="low">
      <VStack gap={4}>
        <HStack justify="between" align="center" wrap="wrap" gap={3}>
          <VStack gap={0.5}>
            <Text type="label" color="accent" weight="semibold">
              2. ELIGE DÍA Y HORA DISPONIBLE
            </Text>
            <Heading level={2}>Agenda en vivo</Heading>
            <HStack gap={1.5} align="center">
              <Globe size={14} aria-hidden="true" />
              <Text type="supporting" color="secondary">
                Hora local del salón · Puebla ({timezone})
              </Text>
            </HStack>
          </VStack>

          <HStack gap={2} wrap="wrap" align="center">
            <SegmentedControl
              label="Formato de hora"
              size="sm"
              value={timeFormat}
              onChange={(v) => onChangeTimeFormat(v as '12h' | '24h')}
            >
              <SegmentedControlItem value="12h" label="12h" />
              <SegmentedControlItem value="24h" label="24h" />
            </SegmentedControl>

            <SegmentedControl
              label="Vista de calendario"
              size="sm"
              value={layoutView}
              onChange={(v) => onChangeLayoutView(v as BookingLayoutView)}
            >
              <SegmentedControlItem
                value="month"
                label="Mes"
                icon={<CalendarIcon size={14} aria-hidden="true" />}
              />
              <SegmentedControlItem
                value="week"
                label="Semana"
                icon={<Grid2x2 size={14} aria-hidden="true" />}
              />
              <SegmentedControlItem
                value="column"
                label="Columnas"
                icon={<Columns3 size={14} aria-hidden="true" />}
              />
            </SegmentedControl>
          </HStack>
        </HStack>

        <Divider />

        {oooBanner}

        {isRangeEmpty ? (
          <Card variant="muted" padding={6} width="100%">
            <EmptyState
              title="Sin disponibilidad en estas fechas"
              description="No quedan espacios libres en el bloque actual de fechas. Revisa el próximo mes o anótate en lista de espera para avisarte si se libera un horario."
              actions={
                <HStack gap={2} wrap="wrap" justify="center">
                  {canAdvanceMonth ? (
                    <Button
                      label="Ver próximo mes →"
                      variant="primary"
                      size="md"
                      icon={<ArrowRight size={16} aria-hidden="true" />}
                      onClick={onAdvanceMonth}
                    />
                  ) : null}
                  <Button
                    label="Anotarme en lista de espera"
                    variant="secondary"
                    size="md"
                    onClick={onOpenWaitlist}
                  />
                  {isViewingFutureWindow ? (
                    <Button
                      label="Volver a fechas actuales"
                      variant="ghost"
                      size="md"
                      onClick={onReturnToToday}
                    />
                  ) : null}
                </HStack>
              }
            />
          </Card>
        ) : layoutView === 'month' ? (
          <Grid columns={{ minWidth: 235, max: 3 }} gap={4} align="start">
            <Card variant="muted" padding={4}>
              <VStack gap={3}>
                <VStack gap={0.5}>
                  <Text type="supporting" color="secondary">
                    {settings.name}
                  </Text>
                  <Heading level={3}>{selectedService?.name}</Heading>
                </VStack>

                <VStack gap={1.5} style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <HStack gap={2} align="center">
                    <Clock size={15} aria-hidden="true" />
                    <Text weight="medium" hasTabularNumbers>
                      Aprox. {formatDuration(totalDurationMinutes)}
                    </Text>
                  </HStack>
                  <HStack gap={2} align="center">
                    <Tag size={15} aria-hidden="true" />
                    <Text weight="semibold" hasTabularNumbers>
                      {formatServicePrice(subtotalCents, hasStartingPrice, settings.currency)}
                    </Text>
                  </HStack>
                  <HStack gap={2} align="center">
                    <MapPin size={15} aria-hidden="true" />
                    <Text type="supporting" color="secondary">
                      {settings.address}
                    </Text>
                  </HStack>
                  <HStack gap={2} align="center">
                    <Globe size={15} aria-hidden="true" />
                    <Text type="supporting" color="secondary">
                      Hora local del salón · Puebla ({timezone})
                    </Text>
                  </HStack>
                </VStack>

                {selectedExtraServices.length > 0 ? (
                  <>
                    <Divider />
                    <VStack gap={1} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <Text type="label" weight="semibold">
                        Servicios adicionales
                      </Text>
                      {selectedExtraServices.map((srv) => (
                        <HStack key={srv.id} justify="between" gap={2}>
                          <Text type="supporting">{srv.name}</Text>
                          <Text type="supporting" hasTabularNumbers>
                            {formatDuration(srv.durationMinutes)}
                          </Text>
                        </HStack>
                      ))}
                    </VStack>
                  </>
                ) : null}

                {activeSelectedAddons.length > 0 ? (
                  <>
                    <Divider />
                    <VStack gap={1} style={{ fontVariantNumeric: 'tabular-nums' }}>
                      <Text type="label" weight="semibold">
                        Extras incluidos
                      </Text>
                      {activeSelectedAddons.map((a) => (
                        <HStack key={a.id} justify="between" gap={2}>
                          <Text type="supporting">{a.name}</Text>
                          <Text type="supporting" hasTabularNumbers>
                            +{a.extraMinutes}m
                          </Text>
                        </HStack>
                      ))}
                    </VStack>
                  </>
                ) : null}

                {showDepositInfo ? (
                  <Banner
                    status="info"
                    title={`Anticipo: ${formatCurrency(
                      depositAmountCents || 20000,
                      settings.currency,
                    )}`}
                    description="En el siguiente paso verás la CLABE de Mercado Pago para subir tu comprobante o mandarlo por Instagram DM."
                  />
                ) : null}
              </VStack>
            </Card>

            <VStack gap={2} align="center">
              <Calendar
                mode="single"
                value={selectedDate as ISODateString}
                min={todayKey as ISODateString}
                max={maxDateKey as ISODateString | undefined}
                dateConstraints={[
                  (date) => {
                    const key = date.toISOString().slice(0, 10);
                    return availableDateSet.has(key);
                  },
                ]}
                onChange={(val) => {
                  if (typeof val === 'string') onSelectDate(val);
                }}
              />
              <HStack gap={2} justify="center" wrap="wrap">
                {isViewingFutureWindow ? (
                  <Button
                    label="Mes actual"
                    variant="ghost"
                    size="sm"
                    onClick={onReturnToToday}
                  />
                ) : null}
                {canAdvanceMonth ? (
                  <Button
                    label="Ver próximo mes →"
                    variant="ghost"
                    size="sm"
                    onClick={onAdvanceMonth}
                  />
                ) : null}
              </HStack>
              <Text type="supporting" color="secondary">
                Los días habilitados muestran horarios libres reales.
              </Text>
            </VStack>

            <VStack gap={3}>
              <HStack justify="between" align="center">
                <Heading level={3}>
                  {formatDateShortInTimezone(`${selectedDate}T18:00:00Z`, timezone)}
                </Heading>
                {selectedDaySummary ? (
                  <Token size="sm" label={`${selectedDaySummary.slotCount} horarios`} />
                ) : null}
              </HStack>

              {loadingAvail ? (
                <ProgressBar label="Consultando disponibilidad real" isIndeterminate />
              ) : slots.length > 0 ? (
                <VStack gap={3} height={420} isScrollable>
                  {morningSlots.length > 0 ? (
                    <VStack gap={1.5}>
                      <Text type="label" color="secondary">
                        Mañana
                      </Text>
                      <Grid columns={2} gap={2}>
                        {morningSlots.map((s) => renderSlotButton(s))}
                      </Grid>
                    </VStack>
                  ) : null}

                  {afternoonSlots.length > 0 ? (
                    <VStack gap={1.5}>
                      <Text type="label" color="secondary">
                        Tarde
                      </Text>
                      <Grid columns={2} gap={2}>
                        {afternoonSlots.map((s) => renderSlotButton(s))}
                      </Grid>
                    </VStack>
                  ) : null}

                  {eveningSlots.length > 0 ? (
                    <VStack gap={1.5}>
                      <Text type="label" color="secondary">
                        Noche
                      </Text>
                      <Grid columns={2} gap={2}>
                        {eveningSlots.map((s) => renderSlotButton(s))}
                      </Grid>
                    </VStack>
                  ) : null}
                </VStack>
              ) : (
                <EmptyState
                  isCompact
                  title="Sin lugares este día"
                  description="Prueba otra fecha o apúntate en lista de espera para avisarte si se libera un espacio."
                  actions={
                    <HStack gap={2} wrap="wrap" justify="center">
                      {canAdvanceMonth ? (
                        <Button
                          label="Ver próximo mes →"
                          variant="primary"
                          size="sm"
                          onClick={onAdvanceMonth}
                        />
                      ) : null}
                      <Button
                        label="Anotarme en lista de espera"
                        variant="secondary"
                        size="sm"
                        onClick={onOpenWaitlist}
                      />
                    </HStack>
                  }
                />
              )}

              <Divider />
              <HStack justify="between" align="center">
                <Text type="supporting" color="secondary">
                  ¿Buscas otra hora ese día?
                </Text>
                <Button
                  label="Lista de espera"
                  variant="ghost"
                  size="sm"
                  onClick={onOpenWaitlist}
                />
              </HStack>
            </VStack>
          </Grid>
        ) : (
          <VStack gap={3}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <Text type="supporting" color="secondary">
                {layoutView === 'column'
                  ? 'Vista en columnas: compara horarios disponibles de varios días al instante.'
                  : 'Vista semanal: elige cualquier bloque libre de la semana.'}
              </Text>
              <HStack gap={2} wrap="wrap">
                {isViewingFutureWindow ? (
                  <Button
                    label="Mes actual"
                    variant="ghost"
                    size="sm"
                    onClick={onReturnToToday}
                  />
                ) : null}
                <Button
                  label="Días anteriores"
                  variant="secondary"
                  size="sm"
                  isDisabled={windowStartIdx <= 0 && !isViewingFutureWindow}
                  onClick={() => {
                    if (windowStartIdx > 0) {
                      const prevDay = availabilityDays[Math.max(0, windowStartIdx - 5)];
                      if (prevDay) onSelectDate(prevDay.date);
                    } else if (isViewingFutureWindow) {
                      onReturnToToday();
                    }
                  }}
                />
                <Button
                  label={
                    windowStartIdx + 6 >= availabilityDays.length && canAdvanceMonth
                      ? 'Ver próximo mes →'
                      : 'Siguientes días'
                  }
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (windowStartIdx + 6 >= availabilityDays.length) {
                      if (canAdvanceMonth) onAdvanceMonth();
                      return;
                    }
                    const nextIdx = Math.min(
                      availabilityDays.length - 1,
                      windowStartIdx + 5,
                    );
                    if (availabilityDays[nextIdx]) {
                      onSelectDate(availabilityDays[nextIdx].date);
                    }
                  }}
                />
              </HStack>
            </HStack>

            <Grid columns={{ minWidth: 160, max: 6 }} gap={3}>
              {weekWindowDays.map((day, index) => {
                const prevDay = index > 0 ? weekWindowDays[index - 1] : undefined;
                const monthBoundary = getMonthBoundaryLabel(day.date, prevDay?.date);
                const dayRedirectId = day.redirectStaffId ?? null;
                const dayRedirectName = day.redirectStaffName ?? null;
                return (
                  <Card key={day.date} variant="muted" padding={3}>
                    <VStack gap={2}>
                      <VStack gap={1}>
                        {monthBoundary ? (
                          <Token size="sm" color="pink" label={monthBoundary} />
                        ) : null}
                        <Text weight="semibold" hasTabularNumbers>
                          {formatDateShortInTimezone(`${day.date}T18:00:00Z`, timezone)}
                        </Text>
                        <Text type="supporting" color="secondary" hasTabularNumbers>
                          {day.slotCount} libres
                        </Text>
                      </VStack>
                      <Divider />
                      {day.publicNote ? (
                        <Text type="supporting" color="accent">
                          {day.publicNote}
                        </Text>
                      ) : null}
                      {dayRedirectId && dayRedirectName ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          width="100%"
                          label={`Ver horarios de ${dayRedirectName}`}
                          onClick={() => onRedirectStaff(dayRedirectId)}
                        />
                      ) : null}
                      {day.slots.length > 0 ? (
                        <VStack gap={1.5} height={340} isScrollable>
                          {day.slots.map((slot) => renderSlotButton(slot, true))}
                        </VStack>
                      ) : (
                        <Text type="supporting" color="secondary">
                          Sin disponibilidad
                        </Text>
                      )}
                    </VStack>
                  </Card>
                );
              })}
            </Grid>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
