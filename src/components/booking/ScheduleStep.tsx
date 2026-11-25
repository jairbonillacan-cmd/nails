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
  loadingAvail: boolean;
  onChangeLayoutView: (view: BookingLayoutView) => void;
  onChangeTimeFormat: (format: '12h' | '24h') => void;
  onSelectDate: (date: string) => void;
  onSelectSlot: (slot: AvailableSlot) => void;
  onOpenWaitlist: () => void;
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
  loadingAvail,
  onChangeLayoutView,
  onChangeTimeFormat,
  onSelectDate,
  onSelectSlot,
  onOpenWaitlist,
}: ScheduleStepProps) {
  const slots = selectedDaySummary?.slots ?? [];
  const morningSlots = slots.filter((s) => s.period === 'morning');
  const afternoonSlots = slots.filter((s) => s.period === 'afternoon');
  const eveningSlots = slots.filter((s) => s.period === 'evening');

  const selectedDayIdx = availabilityDays.findIndex((d) => d.date === selectedDate);
  const weekWindowDays = availabilityDays.slice(
    selectedDayIdx >= 0 ? selectedDayIdx : 0,
    (selectedDayIdx >= 0 ? selectedDayIdx : 0) + 6,
  );
  const maxDateKey = availabilityDays[availabilityDays.length - 1]?.date;
  const showDepositInfo = hasConfiguredDeposit(settings, depositAmountCents);

  const renderSlotButton = (slot: AvailableSlot, compact = false) => {
    const label = timeFormat === '24h' ? slot.localTime24 : slot.localTime12;
    const isSelected =
      selectedSlot?.startAt === slot.startAt && selectedSlot?.staffId === slot.staffId;
    return (
      <Button
        key={`${slot.staffId}-${slot.startAt}`}
        label={label}
        variant={isSelected ? 'primary' : 'secondary'}
        size={compact ? 'sm' : 'md'}
        width="100%"
        icon={<StatusDot variant="success" label="Disponible" />}
        onClick={() => onSelectSlot(slot)}
      />
    );
  };

  return (
    <Card padding={5} elevation="low">
      <VStack gap={4}>
        <HStack justify="between" align="center" wrap="wrap" gap={3}>
          <VStack gap={0.5}>
            <Text type="label" color="accent" weight="semibold">
              2. ELIGE DÍA Y HORA DISPONIBLE
            </Text>
            <Heading level={2}>Agenda en vivo</Heading>
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
                icon={<CalendarIcon size={14} />}
              />
              <SegmentedControlItem
                value="week"
                label="Semana"
                icon={<Grid2x2 size={14} />}
              />
              <SegmentedControlItem
                value="column"
                label="Columnas"
                icon={<Columns3 size={14} />}
              />
            </SegmentedControl>
          </HStack>
        </HStack>

        <Divider />

        {layoutView === 'month' ? (
          <Grid columns={{ minWidth: 235, max: 3 }} gap={4} align="start">
            <Card variant="muted" padding={4}>
              <VStack gap={3}>
                <VStack gap={0.5}>
                  <Text type="supporting" color="secondary">
                    {settings.name}
                  </Text>
                  <Heading level={3}>{selectedService?.name}</Heading>
                </VStack>

                <VStack gap={1.5}>
                  <HStack gap={2} align="center">
                    <Clock size={15} aria-hidden="true" />
                    <Text weight="medium">
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
                      {settings.timezone}
                    </Text>
                  </HStack>
                </VStack>

                {selectedExtraServices.length > 0 ? (
                  <>
                    <Divider />
                    <VStack gap={1}>
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
                    <VStack gap={1}>
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
              <Text type="supporting" color="secondary">
                Los días habilitados muestran horarios libres reales.
              </Text>
            </VStack>

            <VStack gap={3}>
              <HStack justify="between" align="center">
                <Heading level={3}>
                  {formatDateShortInTimezone(`${selectedDate}T18:00:00Z`, settings.timezone)}
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
                    <Button
                      label="Unirme a lista de espera"
                      variant="secondary"
                      size="sm"
                      onClick={onOpenWaitlist}
                    />
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
              <HStack gap={2}>
                <Button
                  label="Días anteriores"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    if (selectedDayIdx > 0) {
                      const prevDay = availabilityDays[Math.max(0, selectedDayIdx - 5)];
                      if (prevDay) onSelectDate(prevDay.date);
                    }
                  }}
                />
                <Button
                  label="Siguientes días"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const nextIdx = Math.min(
                      availabilityDays.length - 1,
                      Math.max(0, selectedDayIdx) + 5,
                    );
                    if (availabilityDays[nextIdx]) {
                      onSelectDate(availabilityDays[nextIdx].date);
                    }
                  }}
                />
              </HStack>
            </HStack>

            <Grid columns={{ minWidth: 160, max: 6 }} gap={3}>
              {weekWindowDays.map((day) => (
                <Card key={day.date} variant="muted" padding={3}>
                  <VStack gap={2}>
                    <VStack gap={0}>
                      <Text weight="semibold">
                        {formatDateShortInTimezone(`${day.date}T18:00:00Z`, settings.timezone)}
                      </Text>
                      <Text type="supporting" color="secondary">
                        {day.slotCount} libres
                      </Text>
                    </VStack>
                    <Divider />
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
              ))}
            </Grid>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}
