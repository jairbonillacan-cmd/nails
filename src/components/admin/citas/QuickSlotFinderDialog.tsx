'use client';

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Banner } from '@astryxdesign/core/Banner';
import { Clock } from 'lucide-react';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { AvailableSlot } from '@/lib/availability/engine';
import type { Service, StaffMember } from '@/lib/types';
import {
  formatCurrency,
  formatDateShortInTimezone,
  formatDuration,
  getDateKeyInTimezone,
} from '@/lib/format';

interface QuickSlotSelection {
  serviceId: string;
  extraServiceIds: string[];
  staffId: string;
  startAt: string;
  dateKey: string;
}

interface QuickSlotFinderDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  services: Service[];
  staff: StaffMember[];
  currency: 'MXN' | 'USD';
  timezone: string;
  todayKey: string;
  lockedStaffId: string | null;
  onPickSlot: (selection: QuickSlotSelection) => void;
}

type DayPeriod = 'Mañana' | 'Tarde' | 'Noche';

function getLocalHourInTimezone(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const raw = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  return raw === 24 ? 0 : raw;
}

function classifyDayPeriod(iso: string, timeZone: string): DayPeriod {
  const hour = getLocalHourInTimezone(iso, timeZone);
  if (hour < 12) return 'Mañana';
  if (hour < 17) return 'Tarde';
  return 'Noche';
}

export function QuickSlotFinderDialog({
  isOpen,
  onOpenChange,
  services,
  staff,
  currency,
  timezone,
  todayKey,
  lockedStaffId,
  onPickSlot,
}: QuickSlotFinderDialogProps) {
  const activeServices = useMemo(
    () => services.filter((s) => s.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [services],
  );
  const activeStaff = useMemo(
    () => staff.filter((s) => s.isActive).toSorted((a, b) => a.displayOrder - b.displayOrder),
    [staff],
  );

  const defaultServiceId = activeServices[0]?.id ?? '';
  const [serviceId, setServiceId] = useState(defaultServiceId);
  const [extraServiceIds, setExtraServiceIds] = useState<string[]>([]);
  const [staffId, setStaffId] = useState(lockedStaffId ?? 'any');
  const [daysWindow, setDaysWindow] = useState<'7' | '14' | '30'>('14');
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [totals, setTotals] = useState<{
    totalDurationMinutes: number;
    subtotalCents: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const effectiveServiceId = serviceId || defaultServiceId;
  const effectiveStaffId = lockedStaffId ?? staffId;
  const cleanExtras = useMemo(
    () => extraServiceIds.filter((id) => id !== effectiveServiceId),
    [extraServiceIds, effectiveServiceId],
  );

  const syncKey = isOpen
    ? `${effectiveServiceId}|${cleanExtras.join(',')}|${effectiveStaffId}|${daysWindow}|${todayKey}`
    : 'closed';

  useExternalSync(syncKey, async (signal, key) => {
    if (key === 'closed' || !effectiveServiceId) return;
    setLoading(true);
    setErrorText(null);
    try {
      const qs = new URLSearchParams({
        mode: 'quick_search',
        serviceId: effectiveServiceId,
        startDate: todayKey,
        days: daysWindow,
        limit: '12',
      });
      if (cleanExtras.length > 0) {
        qs.set('extraServiceIds', cleanExtras.join(','));
      }
      if (effectiveStaffId && effectiveStaffId !== 'any') {
        qs.set('staffId', effectiveStaffId);
      }
      const res = await fetch(`/api/availability?${qs.toString()}`, { signal });
      if (signal.aborted) return;
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        setErrorText(err?.error || 'No se pudieron consultar horarios disponibles.');
        setSlots([]);
        return;
      }
      const json = (await res.json()) as {
        slots?: AvailableSlot[];
        totals?: { totalDurationMinutes: number; subtotalCents: number };
      };
      if (signal.aborted) return;
      setSlots(json.slots ?? []);
      setTotals(json.totals ?? null);
    } catch {
      if (!signal.aborted) {
        setErrorText('Error de conexión al buscar horarios.');
        setSlots([]);
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  });

  const groupedSlots = useMemo(() => {
    const byDate = new Map<
      string,
      Record<DayPeriod, AvailableSlot[]>
    >();
    for (const slot of slots) {
      const dateKey = getDateKeyInTimezone(new Date(slot.startAt), timezone);
      const bucket = byDate.get(dateKey) ?? {
        Mañana: [],
        Tarde: [],
        Noche: [],
      };
      bucket[classifyDayPeriod(slot.startAt, timezone)].push(slot);
      byDate.set(dateKey, bucket);
    }
    return Array.from(byDate.entries());
  }, [slots, timezone]);

  const handleToggleExtra = (extraId: string, checked: boolean) => {
    setExtraServiceIds((prev) =>
      checked
        ? Array.from(new Set([...prev, extraId]))
        : prev.filter((id) => id !== extraId),
    );
  };

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="info"
      width={660}
      padding={5}
    >
      <DialogHeader
        title="Búsqueda rápida de hora"
        subtitle="Encuentra los primeros huecos reales respetando turnos fijos, citas activas y bloqueos recurrentes."
        onOpenChange={onOpenChange}
      />

      <VStack gap={4} paddingBlockStart={4} className="fx-sheet-in">
        <Grid columns={{ minWidth: 220, max: 2 }} gap={3}>
          <Selector
            label="Servicio principal"
            value={effectiveServiceId}
            onChange={(val) => {
              if (val) {
                setServiceId(val);
                setExtraServiceIds((prev) => prev.filter((id) => id !== val));
              }
            }}
            options={activeServices.map((s) => ({
              value: s.id,
              label: `${s.name} (${formatDuration(s.durationMinutes)})`,
            }))}
          />

          <Selector
            label="Especialista"
            value={effectiveStaffId}
            isDisabled={Boolean(lockedStaffId)}
            onChange={(val) => {
              if (!lockedStaffId) setStaffId(val || 'any');
            }}
            options={[
              { value: 'any', label: 'Sin preferencia (primera libre)' },
              ...activeStaff.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />
        </Grid>

        <VStack gap={1.5}>
          <Text type="label" weight="semibold">
            Servicios adicionales (opcional)
          </Text>
          <Grid columns={{ minWidth: 180, max: 2 }} gap={1.5}>
            {activeServices
              .filter((s) => s.id !== effectiveServiceId)
              .map((srv) => (
                <CheckboxInput
                  key={srv.id}
                  size="sm"
                  label={`${srv.name} (+${formatDuration(srv.durationMinutes)})`}
                  value={cleanExtras.includes(srv.id)}
                  onChange={(checked) => handleToggleExtra(srv.id, checked)}
                />
              ))}
          </Grid>
        </VStack>

        <HStack justify="between" align="center" wrap="wrap" gap={2}>
          <SegmentedControl
            label="Horizonte de búsqueda"
            size="sm"
            value={daysWindow}
            onChange={(val) => setDaysWindow(val as '7' | '14' | '30')}
          >
            <SegmentedControlItem value="7" label="7 días" />
            <SegmentedControlItem value="14" label="14 días" />
            <SegmentedControlItem value="30" label="30 días" />
          </SegmentedControl>

          {totals ? (
            <HStack gap={1.5} align="center">
              <Token
                size="sm"
                color="default"
                label={`Duración ${formatDuration(totals.totalDurationMinutes)}`}
              />
              <Token
                size="sm"
                color="green"
                label={formatCurrency(totals.subtotalCents, currency)}
              />
            </HStack>
          ) : null}
        </HStack>

        {errorText ? (
          <Banner status="error" role="alert" title={errorText} />
        ) : null}

        {loading ? (
          <VStack
            className="ad-surface"
            data-tone="subtle"
            data-padded="true"
            gap={3}
            role="status"
            aria-busy="true"
          >
            <Text className="rb-sr-only">Buscando los horarios libres más cercanos...</Text>
            <VStack className="ad-skeleton" data-size="line" data-width="short" aria-hidden="true" />
            <VStack className="rb-skeleton-slots" gap={0} aria-hidden="true">
              <VStack className="ad-skeleton" data-size="slot" />
              <VStack className="ad-skeleton" data-size="slot" />
              <VStack className="ad-skeleton" data-size="slot" />
              <VStack className="ad-skeleton" data-size="slot" />
              <VStack className="ad-skeleton" data-size="slot" />
              <VStack className="ad-skeleton" data-size="slot" />
            </VStack>
          </VStack>
        ) : groupedSlots.length === 0 ? (
          <VStack className="ad-empty" gap={2}>
            <EmptyState
              isCompact
              title="Sin horarios libres en este rango"
              description="Prueba ampliando el horizonte a 30 días o eligiendo Sin preferencia de especialista."
            />
          </VStack>
        ) : (
          <VStack gap={3} className="fx-stagger">
            {groupedSlots.map(([dateKey, periods]) => {
              const totalInDay =
                periods.Mañana.length + periods.Tarde.length + periods.Noche.length;
              return (
                <VStack key={dateKey} className="ad-surface" gap={0}>
                  <HStack className="ad-section-head" justify="between" align="center">
                    <Heading level={4} className="lk-serif ad-h3">
                      {formatDateShortInTimezone(`${dateKey}T18:00:00Z`, timezone)}
                    </Heading>
                    <Text color="inherit" className="ad-chip" data-tone="accent" hasTabularNumbers>
                      {totalInDay} {totalInDay === 1 ? 'horario' : 'horarios'}
                    </Text>
                  </HStack>

                  <VStack padding={4} gap={3}>
                    {(['Mañana', 'Tarde', 'Noche'] as const).map((period) => {
                      const periodSlots = periods[period];
                      if (periodSlots.length === 0) return null;
                      return (
                        <VStack key={period} gap={1.5}>
                          <HStack gap={1.5} align="center">
                            <Clock size={12} aria-hidden="true" />
                            <Text type="supporting" weight="semibold" color="secondary">
                              {period}
                            </Text>
                          </HStack>
                          <HStack gap={1.5} wrap="wrap">
                            {periodSlots.map((slot) => (
                              <Button
                                key={`${slot.staffId}-${slot.startAt}`}
                                type="button"
                                size="sm"
                                variant="secondary"
                                label={`${slot.localTime12} · ${slot.staffName}`}
                                onClick={() => {
                                  onOpenChange(false);
                                  onPickSlot({
                                    serviceId: effectiveServiceId,
                                    extraServiceIds: cleanExtras,
                                    staffId: slot.staffId,
                                    startAt: slot.startAt,
                                    dateKey,
                                  });
                                }}
                              />
                            ))}
                          </HStack>
                        </VStack>
                      );
                    })}
                  </VStack>
                </VStack>
              );
            })}
          </VStack>
        )}
      </VStack>
    </Dialog>
  );
}
