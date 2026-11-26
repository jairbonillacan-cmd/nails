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
import { Clock, RefreshCw, Search } from 'lucide-react';
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

type DiagnosisFilter = 'all' | 'available' | 'blocked';

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

export function VisualTroubleshooter({
  staffId,
  staffMembers,
  services,
  isSpecialistOnly,
  todayKey,
  timezone,
  onSelectStaff,
}: VisualTroubleshooterProps) {
  const [diagDate, setDiagDate] = useState<string>(todayKey);
  const [serviceIdInput, setServiceIdInput] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<DiagnosisFilter>('all');
  const [inspectedTime, setInspectedTime] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<SlotDiagnosis[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  const serviceId = serviceIdInput ?? services[0]?.id ?? '';
  const selectedStaff = staffMembers.find((s) => s.id === staffId);
  const selectedService = services.find((s) => s.id === serviceId);

  const fetchDiagnosis = useCallback(
    async (signal: AbortSignal) => {
      if (!diagDate || !serviceId || !staffId) {
        setDiagnostics([]);
        return;
      }
      setLoading(true);
      try {
        const qs = new URLSearchParams({
          mode: 'diagnose',
          date: diagDate,
          serviceId,
          staffId,
        });
        const res = await fetch(`/api/admin/availability?${qs.toString()}`, {
          cache: 'no-store',
          signal,
        });
        if (signal.aborted) return;
        if (!res.ok) {
          setDiagnostics([]);
          return;
        }
        const json = (await res.json()) as {
          diagnosis?: SlotDiagnosis[];
          diagnostics?: SlotDiagnosis[];
        };
        setDiagnostics(json.diagnosis ?? json.diagnostics ?? []);
      } catch {
        if (!signal.aborted) {
          setDiagnostics([]);
        }
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [diagDate, serviceId, staffId],
  );

  useExternalSync(
    `troubleshoot:${staffId}:${serviceId}:${diagDate}:${reloadCounter}`,
    fetchDiagnosis,
  );

  const availableCount = diagnostics.filter((d) => d.isAvailable).length;
  const blockedCount = diagnostics.length - availableCount;

  const visibleSlots = diagnostics.filter((d) => {
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
    diagnostics.find((d) => d.time24 === inspectedTime) ??
    diagnostics.find((d) => !d.isAvailable) ??
    diagnostics[0] ??
    null;

  const quickDates = [
    { label: 'Hoy', date: todayKey },
    { label: 'Mañana', date: addDaysToYmd(todayKey, 1) },
    { label: '+3 días', date: addDaysToYmd(todayKey, 3) },
    { label: '+7 días', date: addDaysToYmd(todayKey, 7) },
  ];

  const handleSelectDate = (nextDate: string) => {
    setDiagDate(nextDate);
    setInspectedTime(null);
  };

  return (
    <VStack className="ad-split" gap={5}>
      <AdminConfigSection
        id="troubleshooter-results-heading"
        title={`${diagDate} · ${selectedStaff?.name ?? 'Especialista'}`}
        subtitle={selectedService?.name ?? 'Servicio seleccionado'}
        actions={
          <Button
            type="button"
            label="Actualizar"
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={14} aria-hidden="true" />}
            isLoading={loading}
            onClick={() => setReloadCounter((prev) => prev + 1)}
          />
        }
      >
        <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={2}>
          <HStack gap={3} align="center" wrap="wrap">
            <HStack gap={1.5} align="center">
              <StatusDot variant="success" label="Disponibles" />
              <Text type="label" className="fx-tabular" hasTabularNumbers>
                {availableCount} libres
              </Text>
            </HStack>
            <HStack gap={1.5} align="center">
              <StatusDot variant="error" label="Bloqueados" />
              <Text type="label" className="fx-tabular" hasTabularNumbers>
                {blockedCount} bloqueados
              </Text>
            </HStack>
          </HStack>

          <SegmentedControl
            label="Filtrar horarios diagnosticados"
            size="sm"
            value={filterMode}
            onChange={(val) => {
              if (val === 'all' || val === 'available' || val === 'blocked') {
                setFilterMode(val);
              }
            }}
          >
            <SegmentedControlItem value="all" label="Todos" />
            <SegmentedControlItem value="available" label="Libres" />
            <SegmentedControlItem value="blocked" label="Bloqueados" />
          </SegmentedControl>
        </HStack>

        <VStack gap={4} padding={5}>
          {inspectedSlot ? (
            <VStack
              className="ad-surface fx-fade-up"
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
                    label={inspectedSlot.isAvailable ? 'Disponible' : 'Bloqueado'}
                  />
                  <Text weight="bold" className="fx-tabular" hasTabularNumbers>
                    {inspectedSlot.time24} hrs
                  </Text>
                  <Token size="sm" label={inspectedSlot.staffName} />
                </HStack>
                <AdminConfigChip
                  tone={inspectedSlot.isAvailable ? 'success' : 'warning'}
                  label={inspectedSlot.isAvailable ? 'Disponible' : 'Bloqueado'}
                />
              </HStack>
              <Text type="supporting" weight="medium">
                Motivo exacto: {inspectedSlot.reason}
              </Text>
            </VStack>
          ) : null}

          <Divider />

          {loading ? (
            <VStack
              className="rb-skeleton-slots"
              role="status"
              aria-label="Calculando diagnóstico de horarios"
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
              title="No hay horarios en este filtro"
              description="Cambia a Todos o elige otra fecha en el calendario para inspeccionar la disponibilidad."
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
                          label={`${slot.time24} hrs — ${slot.isAvailable ? 'Disponible' : 'Bloqueado'}: ${slot.reason}`}
                          padding={2}
                          variant={isInspected ? 'muted' : 'default'}
                          elevation={isInspected ? 'low' : 'none'}
                          onClick={() => setInspectedTime(slot.time24)}
                        >
                          <HStack justify="between" align="center" gap={1.5}>
                            <HStack gap={1.5} align="center">
                              <StatusDot
                                variant={slot.isAvailable ? 'success' : 'error'}
                                label={slot.isAvailable ? 'Disponible' : 'Bloqueado'}
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
                              <AdminConfigChip label="Ver" tone="accent" />
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
        id="troubleshooter-picker-heading"
        icon={<Search size={16} aria-hidden="true" />}
        title="Selector de diagnóstico"
        subtitle={`Inspecciona por qué cada horario está libre o bloqueado (${timezone}).`}
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
                label="Especialista"
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
              const isSelected = diagDate === item.date;
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
              value={diagDate as ISODateString}
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
