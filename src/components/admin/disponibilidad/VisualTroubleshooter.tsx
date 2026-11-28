'use client';

import { useCallback, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Token } from '@astryxdesign/core/Token';
import { Divider } from '@astryxdesign/core/Divider';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Calendar, type ISODateString } from '@astryxdesign/core/Calendar';
import { Clock, HelpCircle, RefreshCw } from 'lucide-react';
import {
  EmptyStateCard,
  FilterPillBar,
  SkeletonBlock,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { useExternalSync } from '@/lib/hooks/useExternalSync';
import { fetchJsonWithTimeout } from '@/lib/http/client-fetch';
import type { SlotDiagnosis } from '@/lib/availability/engine';
import { formatTimeHHMM12h } from '@/lib/format';
import type { Service, StaffMember } from '@/lib/types';
import {
  addDaysToYmd,
  explainSlotInPlainSpanish,
  groupDiagnosticSlotsByPeriod,
} from './scheduleConstants';

interface VisualTroubleshooterProps {
  staffId: string;
  staffMembers: StaffMember[];
  services: Service[];
  isSpecialistOnly: boolean;
  todayKey: string;
  initialDate?: string | null;
  initialServiceId?: string | null;
  timezone: string;
  onSelectStaff: (nextStaffId: string) => void;
}

type AvailabilityFilter = 'all' | 'available' | 'blocked';

interface DiagnosisResponsePayload {
  diagnosis?: SlotDiagnosis[];
  diagnostics?: SlotDiagnosis[];
}

export function VisualTroubleshooter({
  staffId,
  staffMembers,
  services,
  isSpecialistOnly,
  todayKey,
  initialDate,
  initialServiceId,
  onSelectStaff,
}: VisualTroubleshooterProps) {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || todayKey);
  const [serviceIdInput, setServiceIdInput] = useState<string | null>(initialServiceId ?? null);
  const [filterMode, setFilterMode] = useState<AvailabilityFilter>('all');
  const [inspectedTime, setInspectedTime] = useState<string | null>(null);
  const [slotChecks, setSlotChecks] = useState<SlotDiagnosis[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  const serviceId = serviceIdInput ?? services[0]?.id ?? '';
  const selectedStaff = staffMembers.find((s) => s.id === staffId);
  const selectedService = services.find((s) => s.id === serviceId);

  const fetchSlotChecks = useCallback(
    async (signal: AbortSignal) => {
      if (!selectedDate || !serviceId || !staffId) {
        setSlotChecks([]);
        setFetchError(null);
        return;
      }
      setLoading(true);
      setFetchError(null);
      try {
        const qs = new URLSearchParams({ mode: 'diagnose', date: selectedDate, serviceId, staffId });
        const result = await fetchJsonWithTimeout<DiagnosisResponsePayload>(
          `/api/admin/availability?${qs.toString()}`,
          {
            cache: 'no-store',
            signal,
          },
        );
        if (signal.aborted || result.aborted) return;
        if (!result.ok) {
          setFetchError(
            result.error || 'No se pudo consultar el diagnóstico de horarios. Intenta de nuevo.',
          );
          return;
        }
        setSlotChecks(result.data.diagnosis ?? result.data.diagnostics ?? []);
      } finally {
        if (!signal.aborted) setLoading(false);
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
  const visibleSlots = slotChecks.filter((d) =>
    filterMode === 'available' ? d.isAvailable : filterMode === 'blocked' ? !d.isAvailable : true,
  );
  const groups = groupDiagnosticSlotsByPeriod(visibleSlots);
  const inspectedSlot =
    slotChecks.find((d) => d.time24 === inspectedTime) ??
    slotChecks.find((d) => !d.isAvailable) ??
    slotChecks[0] ??
    null;

  const quickDateOptions = [
    { value: todayKey, label: 'Hoy' },
    { value: addDaysToYmd(todayKey, 1), label: 'Mañana' },
    { value: addDaysToYmd(todayKey, 3), label: 'En 3 días' },
    { value: addDaysToYmd(todayKey, 7), label: 'En 1 semana' },
  ] as const;

  const handleSelectDate = (nextDate: string) => {
    setSelectedDate(nextDate);
    setInspectedTime(null);
  };

  return (
    <VStack className="ad-split ad-split-troubleshooter" gap={5}>
      <SurfaceCard
        id="slot-help-results-heading"
        title={`${selectedDate} · ${selectedStaff?.name ?? 'Profesional'}`}
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

          <FilterPillBar<AvailabilityFilter>
            ariaLabel="Filtrar horas del día"
            mode="segmented"
            size="sm"
            value={filterMode}
            onChange={setFilterMode}
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'available', label: 'Libres' },
              { value: 'blocked', label: 'No salen' },
            ]}
          />
        </HStack>

        <VStack
          gap={4}
          padding={4}
          className={loading && slotChecks.length > 0 ? 'fx-busy' : undefined}
          aria-busy={loading || undefined}
          style={{ minWidth: 0 }}
        >
          {fetchError ? (
            <Banner
              status="error"
              role="alert"
              collapsible={false}
              title={fetchError}
              endContent={
                <Button
                  type="button"
                  label="Reintentar"
                  variant="secondary"
                  size="md"
                  icon={<RefreshCw size={14} aria-hidden="true" />}
                  isDisabled={loading}
                  onClick={() => setReloadCounter((prev) => prev + 1)}
                />
              }
            />
          ) : null}

          {inspectedSlot ? (
            <SurfaceCard tone={inspectedSlot.isAvailable ? 'subtle' : 'warning'} padded>
              <VStack gap={1.5} role="status" aria-live="polite" style={{ minWidth: 0 }}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <StatusDot
                      variant={inspectedSlot.isAvailable ? 'success' : 'error'}
                      label={inspectedSlot.isAvailable ? 'Disponible' : 'No disponible'}
                    />
                    <Text weight="bold" className="fx-tabular" hasTabularNumbers>
                      {formatTimeHHMM12h(inspectedSlot.time24)}
                    </Text>
                    <Token size="sm" label={inspectedSlot.staffName} />
                  </HStack>
                  <StatusTag
                    tone={inspectedSlot.isAvailable ? 'success' : 'warning'}
                    label={inspectedSlot.isAvailable ? 'Sí sale libre' : 'No aparece libre'}
                  />
                </HStack>
                <Text type="supporting" weight="medium" style={{ overflowWrap: 'anywhere' }}>
                  {explainSlotInPlainSpanish(inspectedSlot)}
                </Text>
              </VStack>
            </SurfaceCard>
          ) : null}

          <Divider />

          {loading && slotChecks.length === 0 ? (
            <Grid
              columns={{ minWidth: 152, max: 4 }}
              gap={2}
              role="status"
              aria-label="Revisando horarios del día"
            >
              {Array.from({ length: 8 }, (_, idx) => (
                <SkeletonBlock key={idx} height="2.75rem" radius={2} index={idx} />
              ))}
            </Grid>
          ) : fetchError && slotChecks.length === 0 ? null : groups.length === 0 ? (
            <EmptyStateCard
              framed={false}
              isCompact
              icon={<Clock size={22} aria-hidden="true" />}
              title="No hay horas con este filtro"
              description="Elige Todas o toca otro día en el calendario para revisar qué pasa en cada hora."
              actions={
                filterMode !== 'all' ? (
                  <Button
                    type="button"
                    label="Ver todas las horas"
                    variant="secondary"
                    size="sm"
                    onClick={() => setFilterMode('all')}
                  />
                ) : undefined
              }
            />
          ) : (
            <VStack gap={4} style={{ minWidth: 0 }}>
              {groups.map((group) => (
                <VStack key={group.key} gap={2} style={{ minWidth: 0 }}>
                  <HStack gap={1.5} align="center">
                    <Clock size={14} aria-hidden="true" />
                    <Text type="label" weight="semibold" color="secondary" className="fx-tabular" hasTabularNumbers>
                      {group.label} ({group.items.length})
                    </Text>
                  </HStack>
                  <Grid
                    columns={{ minWidth: 152, max: 4 }}
                    gap={2}
                    role="group"
                    aria-label={group.label}
                  >
                    {group.items.map((slot) => {
                      const isInspected = inspectedSlot?.time24 === slot.time24;
                      return (
                        <ClickableCard
                          key={slot.time24}
                          label={`${formatTimeHHMM12h(slot.time24)} — ${explainSlotInPlainSpanish(slot)}`}
                          padding={2}
                          variant={isInspected ? 'muted' : 'default'}
                          elevation={isInspected ? 'low' : 'none'}
                          onClick={() => setInspectedTime(slot.time24)}
                        >
                          <HStack justify="between" align="center" gap={1.5} wrap="wrap">
                            <HStack gap={1.5} align="center" style={{ minWidth: 0 }}>
                              <StatusDot
                                variant={slot.isAvailable ? 'success' : 'error'}
                                label={slot.isAvailable ? 'Libre' : 'No disponible'}
                              />
                              <Text
                                size="sm"
                                weight="semibold"
                                className="fx-tabular"
                                hasTabularNumbers
                                textWrap="nowrap"
                              >
                                {formatTimeHHMM12h(slot.time24)}
                              </Text>
                            </HStack>
                            {isInspected ? <StatusTag label="Viendo" tone="accent" /> : null}
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
      </SurfaceCard>

      <SurfaceCard
        id="slot-help-picker-heading"
        className="ad-troubleshooter-picker"
        icon={<HelpCircle size={16} aria-hidden="true" />}
        title="¿Qué día quieres revisar?"
        subtitle="Elige un servicio y una fecha para ver por qué una hora aparece libre o no."
        padded
      >
        <VStack gap={4} style={{ minWidth: 0 }}>
          <Grid columns={{ minWidth: 176, max: 2 }} gap={3}>
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
                label="Profesional"
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

          <FilterPillBar<string>
            ariaLabel="Fechas rápidas"
            mode="pills"
            size="sm"
            value={selectedDate}
            onChange={handleSelectDate}
            options={quickDateOptions}
          />

          <VStack width="100%" className="ad-troubleshooter-cal" style={{ minWidth: 0 }}>
            <Calendar
              mode="single"
              weekStartsOn="mon"
              style={{ marginInline: 'auto' }}
              value={selectedDate as ISODateString}
              onChange={(val) => {
                if (typeof val === 'string') handleSelectDate(val);
              }}
            />
          </VStack>
        </VStack>
      </SurfaceCard>
    </VStack>
  );
}
