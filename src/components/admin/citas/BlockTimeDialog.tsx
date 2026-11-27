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
import { Divider } from '@astryxdesign/core/Divider';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { Ban } from 'lucide-react';
import { FilterPillBar } from '@/components/ui/FilterPillBar';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import { DAYS, FIXED_TIME_OPTIONS } from '@/components/admin/disponibilidad/scheduleConstants';
import { formatTimeHHMM12h } from '@/lib/format';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import type { StaffMember } from '@/lib/types';
import {
  formatMinutesHHMM,
  getDayOfWeekFromDateKey,
  parseTimeMinutes,
  shiftDateKey,
} from './scheduleGridGeometry';

export interface BlockTimePrefill {
  readonly dateKey: string;
  readonly startTimeHHMM: string;
  readonly endTimeHHMM: string;
  readonly staffId: string;
}

interface BlockTimeDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: BlockTimePrefill;
  visibleStaff: StaffMember[];
  lockedStaffId: string | null;
  todayKey: string;
  onSaved: (notice: string) => Promise<void>;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const QUICK_REASON_PRESETS = ['Comida', 'Curso', 'Asunto personal', 'Vacaciones'] as const;

function toIsoDateString(value: string): ISODateString | undefined {
  return ISO_DATE_RE.test(value) ? (value as ISODateString) : undefined;
}

function diffDateKeysDays(fromKey: string, toKey: string): number {
  const [fy = 2026, fm = 1, fd = 1] = fromKey.split('-').map(Number);
  const [ty = 2026, tm = 1, td = 1] = toKey.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd, 12, 0, 0);
  const toUtc = Date.UTC(ty, tm - 1, td, 12, 0, 0);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

function collectWeekdaysInRange(startDate: string, endDate: string): number[] {
  const span = Math.max(0, Math.min(6, diffDateKeysDays(startDate, endDate)));
  const set = new Set<number>();
  for (let offset = 0; offset <= span; offset += 1) {
    set.add(getDayOfWeekFromDateKey(shiftDateKey(startDate, offset)));
  }
  return Array.from(set).toSorted((a, b) => a - b);
}

function buildTimeOptions(
  startHHMM: string,
  endHHMM: string,
): Array<{ value: string; label: string }> {
  const startMin = parseTimeMinutes(startHHMM);
  const endMin = parseTimeMinutes(endHHMM);
  const minBound = Math.min(8 * 60, Math.floor(startMin / 15) * 15);
  const maxBound = Math.max(22 * 60, Math.ceil(endMin / 15) * 15);
  if (minBound === 8 * 60 && maxBound === 22 * 60) {
    return FIXED_TIME_OPTIONS;
  }
  const options: Array<{ value: string; label: string }> = [];
  for (let m = minBound; m <= maxBound; m += 15) {
    const value = formatMinutesHHMM(m);
    options.push({ value, label: formatTimeHHMM12h(value) });
  }
  return options;
}

function clampOptionTime(
  value: string,
  options: readonly { value: string; label: string }[],
  fallback: string,
): string {
  return options.some((opt) => opt.value === value) ? value : fallback;
}

export function BlockTimeDialog({
  isOpen,
  onOpenChange,
  prefill,
  visibleStaff,
  lockedStaffId,
  todayKey,
  onSaved,
}: BlockTimeDialogProps) {
  const resolvedStaffId =
    lockedStaffId ??
    (prefill.staffId && prefill.staffId !== 'any'
      ? prefill.staffId
      : (visibleStaff[0]?.id ?? ''));

  const initialDow = getDayOfWeekFromDateKey(prefill.dateKey);
  const initialDayNum = Number(prefill.dateKey.slice(8, 10)) || 1;

  const timeOptions = buildTimeOptions(prefill.startTimeHHMM, prefill.endTimeHHMM);
  const [staffId, setStaffId] = useState(resolvedStaffId);
  const [reason, setReason] = useState('');
  const [startDate, setStartDate] = useState(prefill.dateKey);
  const [endDate, setEndDate] = useState(prefill.dateKey);
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState(() =>
    clampOptionTime(prefill.startTimeHHMM, timeOptions, '10:00'),
  );
  const [endTime, setEndTime] = useState(() =>
    clampOptionTime(prefill.endTimeHHMM, timeOptions, '11:00'),
  );
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [weekdays, setWeekdays] = useState<number[]>([initialDow]);
  const [dayOfMonth, setDayOfMonth] = useState<number>(initialDayNum);
  const [untilDate, setUntilDate] = useState('');

  const effectiveEndDate = endDate >= startDate ? endDate : startDate;
  const effectiveStaffId = lockedStaffId ?? staffId;

  const isSubmitDisabled =
    !effectiveStaffId ||
    !startDate ||
    (!repeat && !effectiveEndDate) ||
    (!allDay && startTime >= endTime) ||
    (repeat && frequency === 'weekly' && weekdays.length === 0);

  const toggleWeekday = (dow: number, checked: boolean) => {
    setWeekdays((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, dow]))
        : prev.filter((d) => d !== dow);
      return next.toSorted((a, b) => a - b);
    });
  };

  const handleStartDateChange = (nextDate: string | undefined) => {
    if (!nextDate) return;
    setStartDate(nextDate);
    if (endDate < nextDate) {
      setEndDate(nextDate);
    }
    if (!repeat) {
      setWeekdays([getDayOfWeekFromDateKey(nextDate)]);
      setDayOfMonth(Number(nextDate.slice(8, 10)) || 1);
    }
  };

  const handleToggleRepeat = (nextRepeat: boolean) => {
    setRepeat(nextRepeat);
    if (nextRepeat && !untilDate && effectiveEndDate > startDate) {
      setUntilDate(effectiveEndDate);
    }
  };

  const buildPayload = (): { payload: Record<string, unknown>; notice: string } | { error: string } => {
    const cleanReason = reason.trim() || (allDay ? 'Día bloqueado' : 'Horario bloqueado');
    if (!allDay && startTime >= endTime) {
      return { error: 'La hora de inicio debe ser anterior a la hora de fin.' };
    }
    if (!repeat && effectiveEndDate < startDate) {
      return { error: 'La fecha de fin no puede ser anterior a la fecha de inicio.' };
    }
    if (repeat) {
      if (frequency === 'weekly' && weekdays.length === 0) {
        return { error: 'Elige al menos un día de la semana para repetir el bloqueo.' };
      }
      const blockStart = allDay ? '00:00' : startTime;
      const blockEnd = allDay ? '23:59' : endTime;
      return {
        payload: {
          kind: 'recurring_block',
          staffId: effectiveStaffId,
          reason: cleanReason,
          frequency,
          weekdays: frequency === 'weekly' ? weekdays : [],
          dayOfMonth:
            frequency === 'monthly'
              ? Math.max(1, Math.min(31, Math.round(dayOfMonth || 1)))
              : null,
          startTime: blockStart,
          endTime: blockEnd,
          untilDate: untilDate.trim() || null,
          isActive: true,
        },
        notice: allDay
          ? `Bloqueo repetitivo guardado (${cleanReason})`
          : `Bloqueo ${formatTimeHHMM12h(blockStart)}–${formatTimeHHMM12h(blockEnd)} guardado`,
      };
    }

    if (allDay) {
      if (startDate === effectiveEndDate) {
        return {
          payload: {
            staffId: effectiveStaffId,
            overrideDate: startDate,
            isUnavailable: true,
            startTime: null,
            endTime: null,
            reason: cleanReason,
          },
          notice: `Día ${startDate} bloqueado (${cleanReason})`,
        };
      }
      return {
        payload: {
          kind: 'override_range',
          staffId: effectiveStaffId,
          startDate,
          endDate: effectiveEndDate,
          isClosed: true,
          startTime: null,
          endTime: null,
          reason: cleanReason,
        },
        notice: `Bloqueo guardado del ${startDate} al ${effectiveEndDate}`,
      };
    }

    const spanDays = diffDateKeysDays(startDate, effectiveEndDate) + 1;
    if (spanDays === 1) {
      const daysAhead = diffDateKeysDays(todayKey || startDate, startDate);
      const useMonthly = daysAhead >= 7 && daysAhead < 28;
      return {
        payload: {
          kind: 'recurring_block',
          staffId: effectiveStaffId,
          reason: cleanReason,
          frequency: useMonthly ? 'monthly' : 'weekly',
          weekdays: useMonthly ? [] : [getDayOfWeekFromDateKey(startDate)],
          dayOfMonth: useMonthly ? Number(startDate.slice(8, 10)) || 1 : null,
          startTime,
          endTime,
          untilDate: startDate,
          isActive: true,
        },
        notice: `Horario bloqueado ${formatTimeHHMM12h(startTime)}–${formatTimeHHMM12h(endTime)}`,
      };
    }

    return {
      payload: {
        kind: 'recurring_block',
        staffId: effectiveStaffId,
        reason: cleanReason,
        frequency: 'weekly',
        weekdays: collectWeekdaysInRange(startDate, effectiveEndDate),
        dayOfMonth: null,
        startTime,
        endTime,
        untilDate: effectiveEndDate,
        isActive: true,
      },
      notice: `Horario ${formatTimeHHMM12h(startTime)}–${formatTimeHHMM12h(endTime)} bloqueado hasta ${effectiveEndDate}`,
    };
  };

  const saveBlock = async (): Promise<FormSubmitResult> => {
    const built = buildPayload();
    if ('error' in built) {
      return formSubmitError(built.error);
    }
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(built.payload),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        return formSubmitResultFromResponse(res, 'No se pudo guardar el bloqueo.');
      }
      await onSaved(built.notice);
      return FORM_SUBMIT_OK;
    } catch {
      return formSubmitError('Sin conexión o tiempo de espera agotado. Intenta de nuevo.');
    }
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Bloquear horario"
      subtitle="Cierra un espacio, varios días o un descanso repetitivo en tu agenda."
      width="min(34rem, 96vw)"
      submitFooter={{
        formId: 'block-time-form',
        submitLabel: repeat ? 'Guardar bloqueo repetitivo' : 'Guardar bloqueo',
        submitIcon: <Ban size={15} aria-hidden="true" />,
        isSubmitDisabled,
      }}
    >
      {(controls: FormDialogControls) => (
        <form
          id="block-time-form"
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            if (isSubmitDisabled) return;
            controls.submit(saveBlock);
          }}
        >
          <VStack gap={4}>
            <Selector
              label="Profesional"
              value={effectiveStaffId}
              isDisabled={Boolean(lockedStaffId)}
              onChange={(val) => val && setStaffId(val)}
              options={visibleStaff.map((s) => ({ value: s.id, label: s.name }))}
            />

            <VStack gap={2}>
              <TextInput
                label="Motivo"
                placeholder="Ej. Comida, vacaciones, curso o asunto personal"
                value={reason}
                onChange={setReason}
                isOptional
              />
              <HStack gap={1.5} wrap="wrap">
                {QUICK_REASON_PRESETS.map((preset) => (
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
            </VStack>

            {!repeat ? (
              <Grid columns={{ minWidth: 160, max: 2 }} gap={3}>
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
                    if (val) setEndDate(val);
                  }}
                  isRequired
                />
              </Grid>
            ) : null}

            <Switch
              label="Todo el día"
              description="Cierra la jornada completa sin dejar espacios disponibles."
              value={allDay}
              onChange={setAllDay}
            />

            {!allDay ? (
              <Grid columns={{ minWidth: 150, max: 2 }} gap={3}>
                <Selector
                  label="Hora de inicio"
                  value={startTime}
                  onChange={(val) => val && setStartTime(val)}
                  options={timeOptions}
                />
                <Selector
                  label="Hora de fin"
                  value={endTime}
                  onChange={(val) => val && setEndTime(val)}
                  options={timeOptions}
                />
              </Grid>
            ) : null}

            <Divider />

            <Switch
              label="Repetir bloqueo"
              description="Programa este bloqueo cada semana o cada mes."
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
                  onChange={setFrequency}
                  options={[
                    { value: 'weekly', label: 'Semanal' },
                    { value: 'monthly', label: 'Mensual' },
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
          </VStack>
        </form>
      )}
    </FormDialog>
  );
}
