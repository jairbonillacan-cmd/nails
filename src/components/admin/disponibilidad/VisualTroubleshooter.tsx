'use client';

import { useCallback, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Divider } from '@astryxdesign/core/Divider';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Calendar, type ISODateString } from '@astryxdesign/core/Calendar';
import { Clock, HelpCircle, RefreshCw } from 'lucide-react';
import {
  AdminConfigChip,
  AdminConfigEmpty,
  AdminConfigSection,
} from '@/components/admin/config/AdminConfigPrimitives';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import type { SlotDiagnosis } from '@/lib/availability/engine';
import type { Service, StaffMember } from '@/lib/types';

interface VisualTroubleshooterProps {
  staffId: string;
  staffMembers: StaffMember[];
  services: Service[];
  isSpecialistOnly: boolean;
  todayKey: string;
  timezone: string;
  onSelectStaff: (nextStaffId: string) => void;
}

type AvailabilityFilter = 'all' | 'available' | 'blocked';

function addDaysToYmd(baseYmd: string, offsetDays: number): string {
  const [y = 2026, m = 1, d = 1] = baseYmd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0, 0))
    .toISOString()
    .slice(0, 10);
}

function getPeriodBucket(time24: string): 'morning' | 'afternoon' | 'evening' {
  const [hh = 0] = time24.split(':').map(Number);
  if (hh < 12) return 'morning';
  if (hh < 18) return 'afternoon';
  return 'evening';
}

function explainSlotInPlainSpanish(slot: SlotDiagnosis): string {
  if (slot.isAvailable) {
    return 'Esta hora está libre y tus clientas sí la pueden ver y reservar.';
  }
  const raw = slot.reason.trim();
  if (/^Bloqueo recurrente:/i.test(raw)) {
    const detail = raw.replace(/^Bloqueo recurrente:\s*/i, '').trim();
    return detail
      ? `Tienes un descanso fijo programado a esta hora (${detail}).`
      : 'Tienes un descanso fijo programado a esta hora.';
  }
  if (/^Bloqueo recurrente$/i.test(raw)) {
    return 'Tienes un descanso fijo programado a esta hora.';
  }
  if (/^Día bloqueado por excepción/i.test(raw)) {
    const match = /\(([^)]+)\)/.exec(raw);
    const note = match?.[1]?.trim();
    return note && note !== 'Sin motivo'
      ? `Este día está marcado como cerrado (${note}).`
      : 'Este día está marcado como cerrado en vacaciones y días cerrados.';
  }
  if (/cambio de horario/i.test(raw)) {
    return 'Esta hora no existe ese día por el cambio de horario.';
  }
  if (/sin horario laboral configurado/i.test(raw)) {
    return `${slot.staffName} no tiene turno activado este día de la semana.`;
  }
  if (/Fuera de horario laboral/i.test(raw)) {
    return 'El servicio se pasa de la hora de cierre o queda fuera del horario de ese día.';
  }
  if (/Fuera de los horarios fijos/i.test(raw)) {
    return 'No es uno de los turnos fijos que elegiste para este día.';
  }
  if (/cuadrícula de intervalos/i.test(raw)) {
    return 'Esta hora no coincide con los espacios configurados para citas.';
  }
  if (/Menor al aviso mínimo/i.test(raw)) {
    return 'Falta muy poco tiempo para esta hora y ya cerró el límite para reservar.';
  }
  if (/Excede el límite máximo/i.test(raw)) {
    return 'Esa fecha está muy lejos; todavía no se abre la agenda para ese día.';
  }
  if (/^Ocupado por cita/i.test(raw)) {
    return `${raw.replace(/^Ocupado por cita/i, 'Ya hay una cita agendada')}.`;
  }
  if (/Apartado temporalmente/i.test(raw)) {
    return 'Otra clienta está reservando este horario justo ahora.';
  }
  if (/Google Calendar/i.test(raw)) {
    return 'Aparece un compromiso ocupado en Google Calendar a esta hora.';
  }
  if (/Especialista inactiva/i.test(raw)) {
    return `${slot.staffName} está pausada o no tiene asignado este servicio en Equipo.`;
  }
  return raw || 'Esta hora no está disponible por ahora.';
}

export function VisualTroubleshooter({
  staffId,
  staffMembers,
  services,
  isSpecialistOnly,
  todayKey,
  onSelectStaff,
}: VisualTroubleshooterProps) {
  const [selectedDate, setSelectedDate] = useState<string>(todayKey);
  const [serviceIdInput, setServiceIdInput] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<AvailabilityFilter>('all');
  const [inspectedTime, setInspectedTime] = useState<string | null>(null);
  const [slotChecks, setSlotChecks] = useState<SlotDiagnosis[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  const serviceId = serviceIdInput ?? services[0]?.id ?? '';
  const selectedStaff = staffMembers.find((s) => s.id === staffId);
  const selectedService = services.find((s) => s.id === serviceId);

  const fetchSlotChecks = useCallback(
    async (signal: AbortSignal) => {
      if (!selectedDate || !serviceId || !staffId) {
        setSlotChecks([]);
        return;
      }
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          mode: 'diagnose',
          date: selectedDate,
          serviceId,
          staffId,
        });
        const res = await fetch(`/api/admin/availability?${qs.toString()}`, {
          cache: 'no-store',
          signal,
        });
        if (signal.aborted) return;
        if (!res.ok) {
          setSlotChecks([]);
          return;
        }
        const json = (await res.json()) as {
          diagnosis?: SlotDiagnosis[];
          diagnostics?: SlotDiagnosis[];
        };
        setSlotChecks(json.diagnosis ?? json.diagnostics ?? []);
      } catch {
        if (!signal.aborted) {
          setSlotChecks([]);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [selectedDate, serviceId, staffId],
  );

  useExternalSync(
    `slot-help:${staffId}:${serviceId}:${selectedDate}:${reloadCounter}`,
    fetchSlotChecks,
  );

  const availableCount = slotChecks.filter((d) => d.isAvailable).length;
  const busyCount = slotChecks.length - availableCount;

  const visibleSlots = slotChecks.filter((d) => {
    if (filterMode === 'available') return d.isAvailable;
    if (filterMode === 'blocked') return !d.isAvailable;
    return true;
  });

  const groups = [
    {
      key: 'morning',
      label: 'Mañana',
      items: visibleSlots.filter((d) => getPeriodBucket(d.time24) === 'morning'),
    },
    {
      key: 'afternoon',
      label: 'Tarde',
      items: visibleSlots.filter((d) => getPeriodBucket(d.time24) === 'afternoon'),
    },
    {
      key: 'evening',
      label: 'Noche',
      items: visibleSlots.filter((d) => getPeriodBucket(d.time24) === 'evening'),
    },
  ].filter((g) => g.items.length > 0);

  const inspectedSlot =
    slotChecks.find((d) => d.time24 === inspectedTime) ??
    slotChecks.find((d) => !d.isAvailable) ??
    slotChecks[0] ??
    null;

  const quickDates = [
    { label: 'Hoy', date: todayKey },
    { label: 'Mañana', date: addDaysToYmd(todayKey, 1) },
    { label: 'En 3 días', date: addDaysToYmd(todayKey, 3) },
    { label: 'En 1 semana', date: addDaysToYmd(todayKey, 7) },
  ];

  const handleSelectDate = (nextDate: string) => {
    setSelectedDate(nextDate);
    setInspectedTime(null);
  };

  return (
    <VStack className="ad-split" gap={5}>
      <AdminConfigSection
        id="slot-help-results-heading"
        title={`${selectedDate} · ${selectedStaff?.name ?? 'Manicurista'}`}
        subtitle={
          selectedService
            ? `Viendo horarios para ${selectedService.name}. Toca cualquier hora para ver el motivo.`
            : 'Toca cualquier hora para ver si sale libre u ocupada.'
        }
        actions={
          <HStack gap={2} align="center" wrap="wrap">
            {loading ? (
              <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                Revisando...
              </Text>
            ) : null}
            <Button
              type="button"
              label={loading ? 'Revisando...' : 'Volver a revisar'}
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} aria-hidden="true" />}
              isLoading={loading}
              isDisabled={loading}
              onClick={() => setReloadCounter((prev) => prev + 1)}
            />
          </HStack>
        }
      >
        <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={2}>
          <HStack gap={3} align="center" wrap="wrap">
            <HStack gap={1.5} align="center">
              <StatusDot variant="success" label="Libres" />
              <Text type="label" className="fx-tabular" hasTabularNumbers>
                {availableCount} libres
              </Text>
            </HStack>
            <HStack gap={1.5} align="center">
              <StatusDot variant="error" label="No disponibles" />
              <Text type="label" className="fx-tabular" hasTabularNumbers>
                {busyCount} ocupadas o cerradas
              </Text>
            </HStack>
          </HStack>

          <SegmentedControl
            label="Filtrar horas del día"
            size="sm"
            value={filterMode}
            onChange={(val) => {
              if (val === 'all' || val === 'available' || val === 'blocked') {
                setFilterMode(val);
              }
            }}
          >
            <SegmentedControlItem value="all" label="Todas" />
            <SegmentedControlItem value="available" label="Libres" />
            <SegmentedControlItem value="blocked" label="No salen" />
          </SegmentedControl>
        </HStack>

        <VStack
          gap={4}
          padding={5}
          className={loading && slotChecks.length > 0 ? 'fx-busy' : undefined}
          aria-busy={loading || undefined}
        >
          {inspectedSlot ? (
            <VStack
              className="ad-surface"
              data-tone={inspectedSlot.isAvailable ? 'subtle' : 'warning'}
              data-padded="true"
              gap={1.5}
              role="status"
              aria-live="polite"
            >
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <HStack gap={2} align="center" wrap="wrap">
                  <StatusDot
                    variant={inspectedSlot.isAvailable ? 'success' : 'error'}
                    label={inspectedSlot.isAvailable ? 'Disponible' : 'No disponible'}
                  />
                  <Text weight="bold" className="fx-tabular" hasTabularNumbers>
                    {inspectedSlot.time24} hrs
                  </Text>
                  <Token size="sm" label={inspectedSlot.staffName} />
                </HStack>
                <AdminConfigChip
                  tone={inspectedSlot.isAvailable ? 'success' : 'warning'}
                  label={inspectedSlot.isAvailable ? 'Sí sale libre' : 'No aparece libre'}
                />
              </HStack>
              <Text type="supporting" weight="medium">
                {explainSlotInPlainSpanish(inspectedSlot)}
              </Text>
            </VStack>
          ) : null}

          <Divider />

          {loading && slotChecks.length === 0 ? (
            <VStack
              className="rb-skeleton-slots"
              role="status"
              aria-label="Revisando horarios del día"
              gap={2}
            >
              {Array.from({ length: 8 }, (_, idx) => (
                <Text key={idx} className="ad-skeleton" data-size="slot" aria-hidden="true">
                  {'\u200B'}
                </Text>
              ))}
            </VStack>
          ) : groups.length === 0 ? (
            <AdminConfigEmpty
              icon={<Clock size={22} aria-hidden="true" />}
              title="No hay horas con este filtro"
              description="Elige Todas o toca otro día en el calendario para revisar qué pasa en cada hora."
            />
          ) : (
            <VStack gap={4}>
              {groups.map((group) => (
                <VStack key={group.key} gap={2}>
                  <HStack gap={1.5} align="center">
                    <Clock size={14} aria-hidden="true" />
                    <Text
                      type="label"
                      weight="semibold"
                      color="secondary"
                      className="fx-tabular"
                      hasTabularNumbers
                    >
                      {group.label} ({group.items.length})
                    </Text>
                  </HStack>
                  <section aria-label={group.label} className="ad-slot-grid">
                    {group.items.map((slot) => {
                      const isInspected = inspectedSlot?.time24 === slot.time24;
                      return (
                        <ClickableCard
                          key={slot.time24}
                          label={`${slot.time24} hrs — ${explainSlotInPlainSpanish(slot)}`}
                          padding={2}
                          variant={isInspected ? 'muted' : 'default'}
                          elevation={isInspected ? 'low' : 'none'}
                          onClick={() => setInspectedTime(slot.time24)}
                        >
                          <HStack justify="between" align="center" gap={1.5}>
                            <HStack gap={1.5} align="center">
                              <StatusDot
                                variant={slot.isAvailable ? 'success' : 'error'}
                                label={slot.isAvailable ? 'Libre' : 'No disponible'}
                              />
                              <Text
                                weight="semibold"
                                className="fx-tabular"
                                hasTabularNumbers
                              >
                                {slot.time24}
                              </Text>
                            </HStack>
                            {isInspected ? (
                              <AdminConfigChip label="Viendo" tone="accent" />
                            ) : null}
                          </HStack>
                        </ClickableCard>
                      );
                    })}
                  </section>
                </VStack>
              ))}
            </VStack>
          )}
        </VStack>
      </AdminConfigSection>

      <AdminConfigSection
        id="slot-help-picker-heading"
        icon={<HelpCircle size={16} aria-hidden="true" />}
        title="¿Qué día quieres revisar?"
        subtitle="Elige un servicio y una fecha para ver en segundos por qué una hora aparece libre o no."
        padded
      >
        <VStack gap={4}>
          <Grid columns={{ minWidth: 150, max: 2 }} gap={3}>
            <Selector
              label="Servicio"
              value={serviceId}
              onChange={(v) => {
                if (v) {
                  setServiceIdInput(v);
                  setInspectedTime(null);
                }
              }}
              options={services.map((s) => ({ value: s.id, label: s.name }))}
            />
            {!isSpecialistOnly ? (
              <Selector
                label="Manicurista"
                value={staffId}
                onChange={(v) => {
                  if (v) {
                    onSelectStaff(v);
                    setInspectedTime(null);
                  }
                }}
                options={staffMembers.map((s) => ({ value: s.id, label: s.name }))}
              />
            ) : null}
          </Grid>

          <HStack gap={1.5} wrap="wrap" role="group" aria-label="Fechas rápidas">
            {quickDates.map((item) => {
              const isSelected = selectedDate === item.date;
              return (
                <button
                  key={item.label}
                  type="button"
                  className="ad-pill fx-press"
                  data-on={isSelected ? 'true' : 'false'}
                  aria-pressed={isSelected}
                  onClick={() => handleSelectDate(item.date)}
                >
                  {item.label}
                </button>
              );
            })}
          </HStack>

          <VStack className="ad-table-scroll" align="center">
            <Calendar
              mode="single"
              weekStartsOn="mon"
              value={selectedDate as ISODateString}
              onChange={(val) => {
                if (typeof val === 'string') {
                  handleSelectDate(val);
                }
              }}
            />
          </VStack>
        </VStack>
      </AdminConfigSection>
    </VStack>
  );
}
