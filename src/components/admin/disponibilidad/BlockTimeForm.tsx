'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Divider } from '@astryxdesign/core/Divider';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { Ban, CalendarClock, CalendarOff } from 'lucide-react';
import { FilterPillBar } from '@/components/ui/FilterPillBar';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import { getDayOfWeekFromDateKey } from '@/components/admin/citas/scheduleGridGeometry';
import type { StaffMember } from '@/lib/types';
import {
  BLOCK_QUICK_REASON_PRESETS,
  buildBlockTimeOptions,
  clampBlockOptionTime,
  submitBlockTimeRequest,
  type BlockTimeDraft,
  type BlockTimeMode,
  type BlockTimePrefill,
} from './blockTimePayload';
import { DAYS } from './scheduleConstants';

export type { BlockTimePrefill } from './blockTimePayload';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MODES: readonly BlockTimeMode[] = ['closed', 'partial', 'special_hours'];

const MODE_LABELS: Record<BlockTimeMode, string> = {
  closed: 'Cerrar día(s)',
  partial: 'Bloquear horas',
  special_hours: 'Horario especial',
};

function toIsoDateString(value: string): ISODateString | undefined {
  return ISO_DATE_RE.test(value) ? (value as ISODateString) : undefined;
}

function getDialogTitle(mode: BlockTimeMode, repeat: boolean): string {
  if (mode === 'closed') return 'Cerrar días o vacaciones';
  if (mode === 'special_hours') return 'Horario especial';
  return repeat ? 'Descanso o bloqueo repetitivo' : 'Bloquear horario';
}

function getDialogSubtitle(mode: BlockTimeMode): string {
  if (mode === 'closed') return 'Cierra uno o varios días completos y avisa a tus clientas si lo necesitas.';
  if (mode === 'special_hours') return 'Define una hora de apertura y cierre distinta para fechas puntuales.';
  return 'Bloquea un espacio puntual o programa un descanso que se repite cada semana o mes.';
}

function getSubmitLabel(mode: BlockTimeMode, repeat: boolean): string {
  if (mode === 'closed') return 'Guardar cierre';
  if (mode === 'special_hours') return 'Guardar horario especial';
  return repeat ? 'Guardar bloqueo repetitivo' : 'Guardar bloqueo';
}

function getSubmitIcon(mode: BlockTimeMode): React.ReactNode {
  if (mode === 'closed') return <CalendarOff size={15} aria-hidden="true" />;
  if (mode === 'special_hours') return <CalendarClock size={15} aria-hidden="true" />;
  return <Ban size={15} aria-hidden="true" />;
}

interface BlockTimeFormStateSummary {
  readonly mode: BlockTimeMode;
  readonly repeat: boolean;
  readonly isSubmitDisabled: boolean;
}

interface BlockTimeFormBodyProps {
  formId: string;
  controls: FormDialogControls;
  visibleStaff: readonly StaffMember[];
  allStaff?: readonly StaffMember[];
  lockedStaffId: string | null;
  todayKey: string;
  prefill?: BlockTimePrefill | null;
  allowedModes?: readonly BlockTimeMode[];
  showStaffSelector?: boolean;
  onSaved: (notice: string) => Promise<void>;
  onStateChange?: (summary: BlockTimeFormStateSummary) => void;
}

function BlockTimeFormBody({
  formId,
  controls,
  visibleStaff,
  allStaff,
  lockedStaffId,
  todayKey,
  prefill,
  allowedModes = DEFAULT_MODES,
  showStaffSelector = true,
  onSaved,
  onStateChange,
}: BlockTimeFormBodyProps) {
  const initialMode: BlockTimeMode =
    prefill?.mode && allowedModes.includes(prefill.mode)
      ? prefill.mode
      : (allowedModes[0] ?? 'closed');
  const initialDate = prefill?.dateKey || todayKey;
  const initialEndDate =
    prefill?.endDateKey && prefill.endDateKey >= initialDate ? prefill.endDateKey : initialDate;
  const resolvedStaffId =
    lockedStaffId ??
    (prefill?.staffId && prefill.staffId !== 'any'
      ? prefill.staffId
      : (visibleStaff[0]?.id ?? ''));
  const initialDow = getDayOfWeekFromDateKey(initialDate);
  const initialDayNum = Number(initialDate.slice(8, 10)) || 1;
  const timeOptions = buildBlockTimeOptions(
    prefill?.startTimeHHMM ?? '10:00',
    prefill?.endTimeHHMM ?? '16:00',
  );

  const [mode, setMode] = useState<BlockTimeMode>(initialMode);
  const [staffId, setStaffId] = useState(resolvedStaffId);
  const [reason, setReason] = useState(prefill?.reason ?? '');
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [startTime, setStartTime] = useState(() =>
    clampBlockOptionTime(
      prefill?.startTimeHHMM,
      timeOptions,
      initialMode === 'special_hours' ? '10:00' : '12:30',
    ),
  );
  const [endTime, setEndTime] = useState(() =>
    clampBlockOptionTime(
      prefill?.endTimeHHMM,
      timeOptions,
      initialMode === 'special_hours' ? '16:00' : '13:30',
    ),
  );
  const [repeat, setRepeat] = useState(Boolean(prefill?.repeat));
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>(
    prefill?.frequency ?? 'weekly',
  );
  const [weekdays, setWeekdays] = useState<number[]>(() =>
    prefill?.weekdays && prefill.weekdays.length > 0 ? [...prefill.weekdays] : [initialDow],
  );
  const [dayOfMonth, setDayOfMonth] = useState<number>(prefill?.dayOfMonth ?? initialDayNum);
  const [untilDate, setUntilDate] = useState(prefill?.untilDate ?? '');
  const [publicNote, setPublicNote] = useState('');
  const [redirectStaffId, setRedirectStaffId] = useState('');

  const effectiveStaffId = lockedStaffId ?? staffId;
  const effectiveEndDate = endDate >= startDate ? endDate : startDate;

  const computeDisabled = (next: {
    mode: BlockTimeMode;
    staffId: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    repeat: boolean;
    frequency: 'weekly' | 'monthly';
    weekdays: readonly number[];
  }): boolean =>
    !next.staffId ||
    !next.startDate ||
    (next.mode !== 'closed' && next.startTime >= next.endTime) ||
    (next.mode === 'partial' &&
      next.repeat &&
      next.frequency === 'weekly' &&
      next.weekdays.length === 0) ||
    ((next.mode !== 'partial' || !next.repeat) && !next.endDate);

  const emitSummary = (patch: Partial<{
    mode: BlockTimeMode;
    staffId: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    repeat: boolean;
    frequency: 'weekly' | 'monthly';
    weekdays: readonly number[];
  }>) => {
    const next = {
      mode: patch.mode ?? mode,
      staffId: patch.staffId ?? effectiveStaffId,
      startDate: patch.startDate ?? startDate,
      endDate: patch.endDate ?? effectiveEndDate,
      startTime: patch.startTime ?? startTime,
      endTime: patch.endTime ?? endTime,
      repeat: patch.repeat ?? repeat,
      frequency: patch.frequency ?? frequency,
      weekdays: patch.weekdays ?? weekdays,
    };
    onStateChange?.({
      mode: next.mode,
      repeat: next.mode === 'partial' && next.repeat,
      isSubmitDisabled: computeDisabled(next),
    });
  };

  const isSubmitDisabled = computeDisabled({
    mode,
    staffId: effectiveStaffId,
    startDate,
    endDate: effectiveEndDate,
    startTime,
    endTime,
    repeat,
    frequency,
    weekdays,
  });

  const redirectStaffPool = allStaff ?? visibleStaff;
  const redirectStaffOptions = [
    { value: '', label: 'Nadie' },
    ...redirectStaffPool
      .filter((s) => s.isActive && s.id !== effectiveStaffId)
      .map((s) => ({ value: s.id, label: s.name })),
  ];

  const handleModeChange = (nextMode: BlockTimeMode) => {
    setMode(nextMode);
    if (nextMode === 'special_hours' && startTime >= endTime) {
      setStartTime('10:00');
      setEndTime('16:00');
      emitSummary({ mode: nextMode, startTime: '10:00', endTime: '16:00' });
      return;
    }
    emitSummary({ mode: nextMode });
  };

  const handleStartDateChange = (nextDate: string | undefined) => {
    if (!nextDate) return;
    setStartDate(nextDate);
    const nextEnd = endDate < nextDate ? nextDate : endDate;
    if (endDate < nextDate) setEndDate(nextDate);
    if (!repeat) {
      const nextWeekdays = [getDayOfWeekFromDateKey(nextDate)];
      setWeekdays(nextWeekdays);
      setDayOfMonth(Number(nextDate.slice(8, 10)) || 1);
      emitSummary({ startDate: nextDate, endDate: nextEnd, weekdays: nextWeekdays });
      return;
    }
    emitSummary({ startDate: nextDate, endDate: nextEnd });
  };

  const toggleWeekday = (dow: number, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...weekdays, dow])).toSorted((a, b) => a - b)
      : weekdays.filter((d) => d !== dow);
    setWeekdays(next);
    emitSummary({ weekdays: next });
  };

  const handleToggleRepeat = (nextRepeat: boolean) => {
    setRepeat(nextRepeat);
    if (nextRepeat && !untilDate && effectiveEndDate > startDate) {
      setUntilDate(effectiveEndDate);
    }
    emitSummary({ repeat: nextRepeat });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitDisabled) return;
    const draft: BlockTimeDraft = {
      mode,
      staffId: effectiveStaffId,
      startDate,
      endDate: effectiveEndDate,
      startTime,
      endTime,
      repeat: mode === 'partial' && repeat,
      frequency,
      weekdays,
      dayOfMonth,
      untilDate,
      reason,
      publicNote,
      redirectStaffId,
      todayKey,
    };
    controls.submit(() => submitBlockTimeRequest(draft, onSaved));
  };

  return (
    <form id={formId} onSubmit={handleSubmit}>
      <VStack gap={4}>
        {allowedModes.length > 1 ? (
          <FilterPillBar<BlockTimeMode>
            ariaLabel="Tipo de bloqueo o ajuste"
            mode="segmented"
            size="sm"
            layout="fill"
            value={mode}
            onChange={handleModeChange}
            options={allowedModes.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
          />
        ) : null}

        {showStaffSelector && visibleStaff.length > 0 ? (
          <Selector
            label="Profesional"
            value={effectiveStaffId}
            isDisabled={Boolean(lockedStaffId)}
            onChange={(val) => {
              if (val) {
                setStaffId(val);
                emitSummary({ staffId: val });
              }
            }}
            options={visibleStaff.map((s) => ({ value: s.id, label: s.name }))}
          />
        ) : null}

        {mode !== 'partial' || !repeat ? (
          <Grid columns={{ minWidth: 150, max: 2 }} gap={3}>
            <DateInput
              label="Fecha de inicio"
              value={toIsoDateString(startDate)}
              format="date_weekday"
              onChange={handleStartDateChange}
              isRequired
            />
            <DateInput
              label="Fecha de fin"
              value={toIsoDateString(effectiveEndDate)}
              min={toIsoDateString(startDate)}
              format="date_weekday"
              onChange={(val) => {
                if (val) {
                  setEndDate(val);
                  emitSummary({ endDate: val });
                }
              }}
              isRequired
            />
          </Grid>
        ) : null}

        {mode !== 'closed' ? (
          <Grid columns={{ minWidth: 150, max: 2 }} gap={3}>
            <Selector
              label={mode === 'special_hours' ? 'Abre a las' : 'Hora de inicio'}
              value={startTime}
              onChange={(val) => {
                if (val) {
                  setStartTime(val);
                  emitSummary({ startTime: val });
                }
              }}
              options={timeOptions}
            />
            <Selector
              label={mode === 'special_hours' ? 'Cierra a las' : 'Hora de fin'}
              value={endTime}
              onChange={(val) => {
                if (val) {
                  setEndTime(val);
                  emitSummary({ endTime: val });
                }
              }}
              options={timeOptions}
            />
          </Grid>
        ) : null}

        <VStack gap={2}>
          <TextInput
            label="Motivo"
            description="Solo visible para el equipo."
            placeholder={
              mode === 'closed'
                ? 'Ej. Vacaciones, día libre o festivo'
                : mode === 'special_hours'
                  ? 'Ej. Sábado corto o evento especial'
                  : 'Ej. Comida, curso o asunto personal'
            }
            value={reason}
            onChange={setReason}
            isOptional
          />
          {mode !== 'special_hours' ? (
            <HStack gap={1.5} wrap="wrap">
              {BLOCK_QUICK_REASON_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={reason.trim() === preset ? 'primary' : 'secondary'}
                  label={preset}
                  onClick={() => setReason(preset)}
                />
              ))}
            </HStack>
          ) : null}
        </VStack>

        {mode === 'partial' ? (
          <>
            <Divider />
            <Switch
              label="Repetir bloqueo"
              description="Programa este descanso cada semana o cada mes."
              value={repeat}
              onChange={handleToggleRepeat}
            />

            {repeat ? (
              <VStack className="ad-subpanel" gap={3}>
                <FilterPillBar<'weekly' | 'monthly'>
                  ariaLabel="Frecuencia de repetición"
                  mode="segmented"
                  size="sm"
                  layout="fill"
                  value={frequency}
                  onChange={(nextFreq) => {
                    setFrequency(nextFreq);
                    emitSummary({ frequency: nextFreq });
                  }}
                  options={[
                    { value: 'weekly', label: 'Cada semana' },
                    { value: 'monthly', label: 'Cada mes' },
                  ]}
                />

                {frequency === 'weekly' ? (
                  <VStack gap={1.5} role="group" aria-label="Días que se repite">
                    <Text type="label" weight="semibold" color="secondary" aria-hidden="true">
                      Días de la semana
                    </Text>
                    <Grid columns={{ minWidth: 72, max: 4 }} gap={1.5}>
                      {DAYS.map(({ dow, short }) => (
                        <CheckboxInput
                          key={dow}
                          size="sm"
                          label={short}
                          value={weekdays.includes(dow)}
                          onChange={(checked) => toggleWeekday(dow, checked)}
                        />
                      ))}
                    </Grid>
                  </VStack>
                ) : (
                  <NumberInput
                    label="Día del mes"
                    description="Del 1 al 31."
                    value={dayOfMonth}
                    min={1}
                    max={31}
                    isIntegerOnly
                    onChange={(val) => setDayOfMonth(val || 1)}
                  />
                )}

                <DateInput
                  label="Hasta fecha"
                  description="Opcional. Déjalo vacío si se repite siempre."
                  value={toIsoDateString(untilDate)}
                  min={toIsoDateString(startDate)}
                  format="date_weekday"
                  onChange={(val) => setUntilDate(val ?? '')}
                  isOptional
                />
              </VStack>
            ) : null}
          </>
        ) : (
          <>
            <Divider />
            <Collapsible
              className="ad-disclosure"
              defaultIsOpen={false}
              trigger={
                <Text weight="semibold" size="sm">
                  Aviso para tus clientas (opcional)
                </Text>
              }
            >
              <VStack gap={3} paddingBlockStart={3}>
                <TextInput
                  label="Mensaje en tu página de citas"
                  description="Si lo dejas vacío, tus clientas no verán el motivo."
                  placeholder="Ej. Estoy de vacaciones, vuelvo el lunes"
                  value={publicNote}
                  onChange={setPublicNote}
                  isOptional
                />
                {redirectStaffOptions.length > 1 ? (
                  <Selector
                    label="Recomendar a otra profesional"
                    value={redirectStaffId}
                    onChange={(v) => setRedirectStaffId(v ?? '')}
                    options={redirectStaffOptions}
                  />
                ) : null}
              </VStack>
            </Collapsible>
          </>
        )}
      </VStack>
    </form>
  );
}

interface BlockTimeFormProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  visibleStaff: readonly StaffMember[];
  allStaff?: readonly StaffMember[];
  lockedStaffId: string | null;
  todayKey: string;
  prefill?: BlockTimePrefill | null;
  allowedModes?: readonly BlockTimeMode[];
  showStaffSelector?: boolean;
  onSaved: (notice: string) => Promise<void>;
}

export function BlockTimeForm({
  isOpen,
  onOpenChange,
  visibleStaff,
  allStaff,
  lockedStaffId,
  todayKey,
  prefill,
  allowedModes = DEFAULT_MODES,
  showStaffSelector = true,
  onSaved,
}: BlockTimeFormProps) {
  const initialMode: BlockTimeMode =
    prefill?.mode && allowedModes.includes(prefill.mode)
      ? prefill.mode
      : (allowedModes[0] ?? 'closed');
  const resolvedStaffId =
    lockedStaffId ??
    (prefill?.staffId && prefill.staffId !== 'any'
      ? prefill.staffId
      : (visibleStaff[0]?.id ?? ''));
  const initialDate = prefill?.dateKey || todayKey;
  const [summary, setSummary] = useState<BlockTimeFormStateSummary>({
    mode: initialMode,
    repeat: initialMode === 'partial' && Boolean(prefill?.repeat),
    isSubmitDisabled: !resolvedStaffId || !initialDate,
  });

  const formId = 'unified-block-time-form';

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={getDialogTitle(summary.mode, summary.repeat)}
      subtitle={getDialogSubtitle(summary.mode)}
      width="min(34rem, 96vw)"
      submitFooter={{
        formId,
        submitLabel: getSubmitLabel(summary.mode, summary.repeat),
        submitIcon: getSubmitIcon(summary.mode),
        isSubmitDisabled: summary.isSubmitDisabled,
      }}
    >
      {(controls) => (
        <BlockTimeFormBody
          formId={formId}
          controls={controls}
          visibleStaff={visibleStaff}
          allStaff={allStaff}
          lockedStaffId={lockedStaffId}
          todayKey={todayKey}
          prefill={prefill}
          allowedModes={allowedModes}
          showStaffSelector={showStaffSelector}
          onSaved={onSaved}
          onStateChange={setSummary}
        />
      )}
    </FormDialog>
  );
}
