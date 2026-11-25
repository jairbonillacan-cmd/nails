'use client';

import { useCallback, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Token } from '@astryxdesign/core/Token';
import { Divider } from '@astryxdesign/core/Divider';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Calendar, type ISODateString } from '@astryxdesign/core/Calendar';
import { Clock, RefreshCw, Search } from 'lucide-react';
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
    <Grid columns={{ minWidth: 300, max: 2 }} gap={5} align="start">
      <Card padding={5}>
        <VStack gap={4}>
          <VStack gap={0.5}>
            <HStack gap={2} align="center">
              <Search size={17} aria-hidden="true" />
              <Heading level={3}>Selector de diagnóstico</Heading>
            </HStack>
            <Text type="supporting" color="secondary">
              Elige fecha, servicio y especialista para inspeccionar por qué cada horario está disponible o bloqueado ({timezone}).
            </Text>
          </VStack>

          <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
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

          <HStack gap={1.5} wrap="wrap">
            {quickDates.map((item) => (
              <Button
                key={item.label}
                type="button"
                size="sm"
                variant={diagDate === item.date ? 'primary' : 'secondary'}
                label={item.label}
                onClick={() => handleSelectDate(item.date)}
              />
            ))}
          </HStack>

          <VStack gap={1.5} align="center">
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
      </Card>

      <Card padding={5}>
        <VStack gap={4}>
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <VStack gap={0.5}>
              <Heading level={3} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {diagDate} · {selectedStaff?.name ?? 'Especialista'}
              </Heading>
              <Text type="supporting" color="secondary">
                {selectedService?.name ?? 'Servicio'}
              </Text>
            </VStack>
            <Button
              type="button"
              label="Actualizar"
              variant="secondary"
              size="sm"
              icon={<RefreshCw size={14} />}
              isLoading={loading}
              onClick={() => setReloadCounter((prev) => prev + 1)}
            />
          </HStack>

          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <HStack gap={3} align="center" wrap="wrap">
              <HStack gap={1.5} align="center">
                <StatusDot variant="success" label="Disponibles" />
                <Text type="label" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {availableCount} disponibles
                </Text>
              </HStack>
              <HStack gap={1.5} align="center">
                <StatusDot variant="error" label="Bloqueados" />
                <Text type="label" style={{ fontVariantNumeric: 'tabular-nums' }}>
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

          {inspectedSlot ? (
            <Card variant="muted" padding={4}>
              <VStack gap={1.5} role="status" aria-live="polite">
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <HStack gap={2} align="center">
                    <StatusDot
                      variant={inspectedSlot.isAvailable ? 'success' : 'error'}
                      label={inspectedSlot.isAvailable ? 'Disponible' : 'Bloqueado'}
                    />
                    <Text weight="bold" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {inspectedSlot.time24} hrs
                    </Text>
                    <Token size="sm" label={inspectedSlot.staffName} />
                  </HStack>
                  <Badge
                    variant={inspectedSlot.isAvailable ? 'success' : 'error'}
                    label={inspectedSlot.isAvailable ? 'Disponible' : 'Bloqueado'}
                  />
                </HStack>
                <Text type="supporting" weight="medium">
                  Motivo exacto: {inspectedSlot.reason}
                </Text>
              </VStack>
            </Card>
          ) : null}

          <Divider />

          {loading ? (
            <ProgressBar label="Calculando diagnóstico de horarios" isIndeterminate />
          ) : groups.length === 0 ? (
            <Text type="supporting" color="secondary">
              No hay horarios en este filtro para la fecha seleccionada.
            </Text>
          ) : (
            <VStack gap={4}>
              {groups.map((group) => (
                <VStack key={group.key} gap={2}>
                  <HStack gap={1.5} align="center">
                    <Clock size={14} aria-hidden="true" />
                    <Text type="label" weight="semibold" color="secondary">
                      {group.label} ({group.items.length})
                    </Text>
                  </HStack>
                  <Grid columns={{ minWidth: 112, max: 4 }} gap={2}>
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
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                              >
                                {slot.time24}
                              </Text>
                            </HStack>
                            {isInspected ? (
                              <Badge variant="info" label="Ver" />
                            ) : null}
                          </HStack>
                        </ClickableCard>
                      );
                    })}
                  </Grid>
                </VStack>
              ))}
            </VStack>
          )}
        </VStack>
      </Card>
    </Grid>
  );
}
