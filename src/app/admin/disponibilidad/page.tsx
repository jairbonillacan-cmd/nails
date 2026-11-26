'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { TextInput } from '@astryxdesign/core/TextInput';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { Badge } from '@astryxdesign/core/Badge';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import {
  Archive,
  CalendarOff,
  CalendarPlus,
  Check,
  Clock,
  Coffee,
  Copy,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  AdminConfigChip,
  AdminConfigEmpty,
  AdminConfigKpiStrip,
  AdminConfigPageHeader,
  AdminConfigSection,
  AdminConfigSkeleton,
  type AdminConfigKpiItem,
} from '@/components/admin/config/AdminConfigPrimitives';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import type { AvailabilityRule, DateOverride, RecurringBlock } from '@/lib/types';

const VisualTroubleshooter = dynamic(
  () =>
    import('@/components/admin/disponibilidad/VisualTroubleshooter').then(
      (mod) => mod.VisualTroubleshooter,
    ),
  {
    ssr: false,
    loading: () => <AdminConfigSkeleton kpiCount={0} withSplit={false} />,
  },
);

const DAYS: Array<{ dow: 0 | 1 | 2 | 3 | 4 | 5 | 6; label: string; short: string }> = [
  { dow: 1, label: 'Lunes', short: 'Lun' },
  { dow: 2, label: 'Martes', short: 'Mar' },
  { dow: 3, label: 'Miércoles', short: 'Mié' },
  { dow: 4, label: 'Jueves', short: 'Jue' },
  { dow: 5, label: 'Viernes', short: 'Vie' },
  { dow: 6, label: 'Sábado', short: 'Sáb' },
  { dow: 0, label: 'Domingo', short: 'Dom' },
];

const WEEKDAY_SHORT_BY_DOW: Record<number, string> = {
  0: 'Dom',
  1: 'Lun',
  2: 'Mar',
  3: 'Mié',
  4: 'Jue',
  5: 'Vie',
  6: 'Sáb',
};

function formatRecurringSummary(block: RecurringBlock): string {
  const freqLabel =
    block.frequency === 'weekly'
      ? `Cada semana (${block.weekdays.map((d) => WEEKDAY_SHORT_BY_DOW[d] ?? String(d)).join(', ')})`
      : `Cada mes (día ${block.dayOfMonth ?? 1})`;
  const untilSuffix = block.untilDate ? ` · Hasta ${block.untilDate}` : '';
  return `${freqLabel} · ${block.startTime} – ${block.endTime}${untilSuffix}`;
}

function serializeRulesCanonical(rulesList: readonly AvailabilityRule[]): string {
  const normalized = rulesList
    .map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      fixedStartTimes:
        r.fixedStartTimes && r.fixedStartTimes.length > 0
          ? Array.from(new Set(r.fixedStartTimes)).toSorted()
          : [],
    }))
    .toSorted(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek ||
        a.startTime.localeCompare(b.startTime) ||
        a.endTime.localeCompare(b.endTime),
    );
  return JSON.stringify(normalized);
}

const TIME_OPTIONS = Array.from({ length: 29 }, (_, i) => {
  const totalMin = 8 * 60 + i * 30;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
});

const FIXED_TIME_OPTIONS = Array.from({ length: 57 }, (_, i) => {
  const totalMin = 8 * 60 + i * 15;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
});

const DEFAULT_FIXED_BLOCKS = ['10:00', '13:30', '16:30'];

const HOLIDAY_YEAR_OPTIONS = [
  { value: '2026', label: '2026' },
  { value: '2027', label: '2027' },
  { value: '2028', label: '2028' },
];

export default function AdminAvailabilityPage() {
  const { data, loading, refresh } = useAdminData();
  const [tab, setTab] = useState('weekly');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [rulesDraft, setRulesDraft] = useState<AvailabilityRule[] | null>(null);
  const [newFixedByRule, setNewFixedByRule] = useState<Record<string, string>>({});
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingOptimize, setSavingOptimize] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);
  const saveNotice = useEphemeralMessage(3200);

  const [ovrMode, setOvrMode] = useState<'single' | 'range'>('single');
  const [ovrDateInput, setOvrDateInput] = useState<string | null>(null);
  const [ovrEndDateInput, setOvrEndDateInput] = useState<string | null>(null);
  const [ovrClosed, setOvrClosed] = useState(true);
  const [ovrStart, setOvrStart] = useState('10:00');
  const [ovrEnd, setOvrEnd] = useState('16:00');
  const [ovrReason, setOvrReason] = useState('');
  const [ovrPublicNote, setOvrPublicNote] = useState('');
  const [ovrRedirectStaffId, setOvrRedirectStaffId] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);
  const [holidayYear, setHolidayYear] = useState('2026');
  const [preloadingHolidays, setPreloadingHolidays] = useState(false);

  const [recFrequency, setRecFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [recWeekdays, setRecWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [recDayOfMonth, setRecDayOfMonth] = useState<number>(15);
  const [recStartTime, setRecStartTime] = useState('12:30');
  const [recEndTime, setRecEndTime] = useState('13:15');
  const [recReason, setRecReason] = useState('');
  const [recUntilDate, setRecUntilDate] = useState('');
  const [savingRecurring, setSavingRecurring] = useState(false);

  if (loading || !data) {
    return <AdminConfigSkeleton kpiCount={3} withSplit={false} />;
  }

  const isOwner = data.session.user.role === 'owner';
  const isSpecialistOnly =
    data.session.user.role === 'specialist' && Boolean(data.session.user.staffMemberId);

  const staffId = isSpecialistOnly
    ? (data.session.user.staffMemberId ?? '')
    : (selectedStaffId ?? data.staff[0]?.id ?? '');

  const activeStaffMember = data.staff.find((s) => s.id === staffId) ?? data.staff[0] ?? null;

  const currentScheduleRules =
    data.schedules.find((s) => s.staffId === staffId)?.rules ?? [];
  const rules = rulesDraft ?? currentScheduleRules;
  const isScheduleDirty =
    rulesDraft !== null &&
    serializeRulesCanonical(rules) !== serializeRulesCanonical(currentScheduleRules);

  const ovrDate = ovrDateInput ?? data.serverTodayKey;
  const ovrEndDate = ovrEndDateInput ?? ovrDate;
  const optimizeContinuousSlots = data.settings.optimizeContinuousSlots ?? false;

  const redirectStaffOptions = [
    { value: '', label: 'Sin sugerir compañera' },
    ...data.staff
      .filter((s) => s.isActive && s.id !== staffId)
      .map((s) => ({ value: s.id, label: `Sugerir a ${s.name}` })),
  ];

  const staffOverrides = data.dateOverrides
    .filter((o) => o.staffId === staffId)
    .toSorted((a, b) => a.overrideDate.localeCompare(b.overrideDate));
  const activeOverrides = staffOverrides.filter((o) => o.overrideDate >= data.serverTodayKey);
  const archivedOverrides = staffOverrides
    .filter((o) => o.overrideDate < data.serverTodayKey)
    .toSorted((a, b) => b.overrideDate.localeCompare(a.overrideDate));

  const staffRecurringBlocks = data.recurringBlocks.filter((b) => b.staffId === staffId);
  const activeRecurringCount = staffRecurringBlocks.filter((b) => b.isActive).length;
  const totalBreaksBadge = activeRecurringCount + activeOverrides.length;

  const activeDaysSet = new Set(rules.map((r) => r.dayOfWeek));

  const kpiItems: AdminConfigKpiItem[] = [
    {
      id: 'work-days',
      label: 'Días que trabaja',
      value: `${activeDaysSet.size} de 7`,
      sub: activeStaffMember?.name ?? 'Manicurista',
    },
    {
      id: 'recurring-count',
      label: 'Descansos fijos',
      value: String(activeRecurringCount),
      sub:
        activeRecurringCount === 1
          ? '1 descanso activo'
          : `${activeRecurringCount} descansos activos`,
    },
    {
      id: 'upcoming-overrides',
      label: 'Vacaciones y cierres',
      value: String(activeOverrides.length),
      sub:
        activeOverrides.length === 1
          ? '1 fecha próxima'
          : `${activeOverrides.length} fechas próximas`,
    },
  ];

  const updateRules = (updater: (prev: AvailabilityRule[]) => AvailabilityRule[]) => {
    setRulesDraft((prev) => updater(prev ?? currentScheduleRules));
  };

  const handleSelectStaff = (nextId: string) => {
    setSelectedStaffId(nextId);
    setRulesDraft(null);
    setNewFixedByRule({});
    if (ovrRedirectStaffId === nextId) {
      setOvrRedirectStaffId('');
    }
  };

  const toggleDay = (dow: 0 | 1 | 2 | 3 | 4 | 5 | 6, enabled: boolean) => {
    if (!enabled) {
      updateRules((prev) => prev.filter((r) => r.dayOfWeek !== dow));
    } else {
      updateRules((prev) => [
        ...prev,
        {
          id: `r-${dow}-${Date.now()}`,
          dayOfWeek: dow,
          startTime: '10:00',
          endTime: '19:30',
          fixedStartTimes: [...DEFAULT_FIXED_BLOCKS],
        },
      ]);
    }
  };

  const setDayScheduleMode = (
    dow: 0 | 1 | 2 | 3 | 4 | 5 | 6,
    mode: 'fixed' | 'continuous',
  ) => {
    updateRules((prev) => {
      const dayRules = prev.filter((r) => r.dayOfWeek === dow);
      const otherRules = prev.filter((r) => r.dayOfWeek !== dow);
      if (dayRules.length === 0) return prev;

      if (mode === 'continuous') {
        const cleaned = dayRules.map((r) => ({
          id: r.id,
          dayOfWeek: r.dayOfWeek,
          startTime: r.startTime,
          endTime: r.endTime,
        }));
        return [...otherRules, ...cleaned];
      }

      const earliestStart = dayRules.map((r) => r.startTime).toSorted()[0] ?? '10:00';
      const latestEnd = dayRules.map((r) => r.endTime).toSorted().at(-1) ?? '19:30';
      const existingFixed = dayRules.flatMap((r) => r.fixedStartTimes ?? []);
      const seededFixed =
        existingFixed.length > 0
          ? existingFixed.filter((t) => t >= earliestStart && t < latestEnd)
          : DEFAULT_FIXED_BLOCKS.filter((t) => t >= earliestStart && t < latestEnd);
      const finalFixed =
        seededFixed.length > 0
          ? Array.from(new Set(seededFixed)).toSorted()
          : [earliestStart];

      return [
        ...otherRules,
        {
          id: dayRules[0]?.id ?? `r-${dow}-${Date.now()}`,
          dayOfWeek: dow,
          startTime: earliestStart,
          endTime: latestEnd,
          fixedStartTimes: finalFixed,
        },
      ];
    });
  };

  const addFixedStartTime = (ruleId: string, timeToAdd: string) => {
    if (!timeToAdd) return;
    updateRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        if (timeToAdd < r.startTime || timeToAdd >= r.endTime) return r;
        const nextTimes = Array.from(
          new Set([...(r.fixedStartTimes ?? []), timeToAdd]),
        ).toSorted();
        return { ...r, fixedStartTimes: nextTimes };
      }),
    );
  };

  const removeFixedStartTime = (ruleId: string, timeToRemove: string) => {
    updateRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        const remaining = (r.fixedStartTimes ?? []).filter((t) => t !== timeToRemove);
        return {
          ...r,
          fixedStartTimes: remaining.length > 0 ? remaining : [r.startTime],
        };
      }),
    );
  };

  const updateRuleBoundary = (
    ruleId: string,
    field: 'startTime' | 'endTime',
    val: string,
  ) => {
    updateRules((prev) =>
      prev.map((r) => {
        if (r.id !== ruleId) return r;
        const nextStart = field === 'startTime' ? val : r.startTime;
        const nextEnd = field === 'endTime' ? val : r.endTime;
        if (nextStart >= nextEnd) return r;
        if (!r.fixedStartTimes || r.fixedStartTimes.length === 0) {
          return { ...r, startTime: nextStart, endTime: nextEnd };
        }
        const inWindow = r.fixedStartTimes.filter((t) => t >= nextStart && t < nextEnd);
        return {
          ...r,
          startTime: nextStart,
          endTime: nextEnd,
          fixedStartTimes: inWindow.length > 0 ? inWindow : [nextStart],
        };
      }),
    );
  };

  const addSplitShift = (dow: 0 | 1 | 2 | 3 | 4 | 5 | 6) => {
    updateRules((prev) => [
      ...prev,
      {
        id: `r-${dow}-${Date.now()}`,
        dayOfWeek: dow,
        startTime: '15:00',
        endTime: '19:30',
      },
    ]);
  };

  const copyDayToWeekdays = (sourceDow: 0 | 1 | 2 | 3 | 4 | 5 | 6) => {
    const sourceRules = rules.filter((r) => r.dayOfWeek === sourceDow);
    const targets: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];
    updateRules((prev) => {
      const kept = prev.filter((r) => !targets.includes(r.dayOfWeek as 1 | 2 | 3 | 4 | 5));
      const copied = targets.flatMap((d) =>
        sourceRules.map((sr, i) => ({
          ...sr,
          id: `r-copy-${d}-${i}-${Date.now()}`,
          dayOfWeek: d,
          ...(sr.fixedStartTimes ? { fixedStartTimes: [...sr.fixedStartTimes] } : {}),
        })),
      );
      return [...kept, ...copied];
    });
    setMsg({
      status: 'success',
      text: 'Horario copiado de lunes a viernes. Pulsa Guardar horario para aplicar.',
    });
  };

  const saveWeekly = async () => {
    if (!isScheduleDirty || savingWeekly) return;
    setSavingWeekly(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, rules }),
      });
      if (res.ok) {
        await refresh();
        setRulesDraft(null);
        saveNotice.show('Horario guardado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text:
            errJson?.error ||
            'Revisa que cada hora fija esté dentro del horario de apertura y cierre.',
        });
      }
    } catch {
      setMsg({
        status: 'error',
        text: 'Error de conexión al guardar el horario.',
      });
    } finally {
      setSavingWeekly(false);
    }
  };

  const handleToggleOptimizeContinuous = async (nextVal: boolean) => {
    if (!isOwner || savingOptimize) return;
    setSavingOptimize(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optimizeContinuousSlots: nextVal }),
      });
      if (res.ok) {
        await refresh();
        saveNotice.show(
          nextVal ? 'Ajuste automático activado' : 'Ajuste automático desactivado',
        );
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo actualizar esta opción.',
        });
      }
    } finally {
      setSavingOptimize(false);
    }
  };

  const addClosedDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ovrDate || savingOverride) return;
    setSavingOverride(true);
    setMsg(null);
    try {
      const cleanPublicNote = ovrPublicNote.trim();
      const cleanRedirect = ovrRedirectStaffId.trim() || null;

      const payload =
        ovrMode === 'range'
          ? {
              kind: 'override_range' as const,
              staffId,
              startDate: ovrDate,
              endDate: ovrEndDate || ovrDate,
              isClosed: ovrClosed,
              startTime: ovrClosed ? null : ovrStart,
              endTime: ovrClosed ? null : ovrEnd,
              reason: ovrReason || (ovrClosed ? 'Vacaciones / Días cerrados' : 'Horario especial'),
              ...(cleanPublicNote ? { publicNote: cleanPublicNote } : {}),
              redirectStaffId: cleanRedirect,
            }
          : {
              staffId,
              overrideDate: ovrDate,
              isUnavailable: ovrClosed,
              startTime: ovrClosed ? null : ovrStart,
              endTime: ovrClosed ? null : ovrEnd,
              reason: ovrReason || (ovrClosed ? 'Día cerrado' : 'Horario especial'),
              ...(cleanPublicNote ? { publicNote: cleanPublicNote } : {}),
              redirectStaffId: cleanRedirect,
            };

      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = (await res.json()) as { overrides?: DateOverride[] };
        await refresh();
        setOvrReason('');
        setOvrPublicNote('');
        setOvrRedirectStaffId('');
        saveNotice.show(
          ovrMode === 'range'
            ? `Fechas guardadas (${json.overrides?.length ?? 1} días)`
            : `Fecha guardada (${ovrDate})`,
        );
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo guardar la fecha.',
        });
      }
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al guardar la fecha.' });
    } finally {
      setSavingOverride(false);
    }
  };

  const handleDeleteOverride = async (override: DateOverride) => {
    if (busyItemId) return;
    setBusyItemId(override.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/availability?id=${encodeURIComponent(override.id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await refresh();
        saveNotice.show(`Fecha ${override.overrideDate} eliminada`);
      } else {
        setMsg({ status: 'error', text: 'No se pudo eliminar esa fecha.' });
      }
    } finally {
      setBusyItemId(null);
    }
  };

  const handlePreloadMxHolidays = async () => {
    if (preloadingHolidays) return;
    setPreloadingHolidays(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'preload_mx_holidays',
          year: Number(holidayYear) || 2026,
          staffId,
          publicNote: 'Cerrado por día festivo en México',
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          created?: DateOverride[];
          skippedDates?: string[];
          year?: number;
        };
        const createdCount = json.created?.length ?? 0;
        const skippedCount = json.skippedDates?.length ?? 0;
        await refresh();
        setMsg({
          status: 'success',
          text: `Festivos de México ${json.year ?? holidayYear}: ${createdCount} día(s) marcados como cerrados${skippedCount > 0 ? ` (${skippedCount} ya estaban marcados)` : ''}.`,
        });
        saveNotice.show(`Festivos ${json.year ?? holidayYear} marcados`);
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudieron marcar los días festivos.',
        });
      }
    } finally {
      setPreloadingHolidays(false);
    }
  };

  const toggleRecWeekday = (dow: number, checked: boolean) => {
    setRecWeekdays((prev) => {
      const next = checked
        ? Array.from(new Set([...prev, dow]))
        : prev.filter((d) => d !== dow);
      return next.toSorted((a, b) => a - b);
    });
  };

  const createRecurringBreak = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId || savingRecurring) return;
    if (recFrequency === 'weekly' && recWeekdays.length === 0) {
      setMsg({
        status: 'error',
        text: 'Elige al menos un día de la semana para este descanso.',
      });
      return;
    }
    if (recStartTime >= recEndTime) {
      setMsg({
        status: 'error',
        text: 'La hora de inicio debe ser antes que la hora de fin.',
      });
      return;
    }
    setSavingRecurring(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'recurring_block',
          staffId,
          reason: recReason.trim() || 'Descanso fijo',
          frequency: recFrequency,
          weekdays: recFrequency === 'weekly' ? recWeekdays : [],
          dayOfMonth:
            recFrequency === 'monthly'
              ? Math.max(1, Math.min(31, Math.round(recDayOfMonth || 1)))
              : null,
          startTime: recStartTime,
          endTime: recEndTime,
          untilDate: recUntilDate.trim() || null,
          isActive: true,
        }),
      });
      if (res.ok) {
        await refresh();
        setRecReason('');
        setRecUntilDate('');
        saveNotice.show('Descanso fijo guardado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo guardar el descanso fijo.',
        });
      }
    } catch {
      setMsg({ status: 'error', text: 'Error de conexión al guardar el descanso.' });
    } finally {
      setSavingRecurring(false);
    }
  };

  const handleToggleRecurringBlock = async (block: RecurringBlock) => {
    if (busyItemId) return;
    setBusyItemId(block.id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'recurring_block_toggle',
          id: block.id,
          isActive: !block.isActive,
        }),
      });
      if (res.ok) {
        await refresh();
        saveNotice.show(block.isActive ? 'Descanso pausado' : 'Descanso reactivado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo actualizar este descanso.',
        });
      }
    } finally {
      setBusyItemId(null);
    }
  };

  const handleDeleteRecurringBlock = async (block: RecurringBlock) => {
    if (busyItemId) return;
    setBusyItemId(block.id);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/admin/availability?blockId=${encodeURIComponent(block.id)}`,
        { method: 'DELETE' },
      );
      if (res.ok) {
        await refresh();
        saveNotice.show('Descanso eliminado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo eliminar este descanso.',
        });
      }
    } finally {
      setBusyItemId(null);
    }
  };

  const renderClosedDateRow = (o: DateOverride) => {
    const redirectStaff = o.redirectStaffId
      ? data.staff.find((s) => s.id === o.redirectStaffId)
      : null;
    const isBusy = busyItemId === o.id;

    return (
      <li
        key={o.id}
        className={isBusy ? 'ad-row-item fx-busy' : 'ad-row-item'}
        aria-busy={isBusy || undefined}
      >
        <VStack gap={1} className="rb-grow">
          <HStack gap={2} align="center" wrap="wrap">
            <Text weight="semibold" className="fx-tabular" hasTabularNumbers>
              {o.overrideDate}
            </Text>
            <AdminConfigChip
              tone={o.isUnavailable ? 'warning' : 'accent'}
              label={o.isUnavailable ? 'Cerrado' : `${o.startTime} – ${o.endTime}`}
              hasTabularNumbers
            />
          </HStack>
          <Text type="supporting" color="secondary">
            {o.reason || (o.isUnavailable ? 'Día cerrado' : 'Horario especial')}
          </Text>
          {o.publicNote || redirectStaff ? (
            <HStack gap={1.5} wrap="wrap">
              {o.publicNote ? (
                <AdminConfigChip tone="neutral" label={`Aviso: ${o.publicNote}`} />
              ) : null}
              {redirectStaff ? (
                <AdminConfigChip tone="success" label={`Sugiere a ${redirectStaff.name}`} />
              ) : null}
            </HStack>
          ) : null}
        </VStack>
        <Button
          type="button"
          label={isBusy ? 'Quitando...' : 'Quitar'}
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} aria-hidden="true" />}
          isLoading={isBusy}
          isDisabled={isBusy || Boolean(busyItemId)}
          onClick={() => void handleDeleteOverride(o)}
        />
      </li>
    );
  };

  const isAnyBusy =
    savingWeekly ||
    savingOptimize ||
    savingOverride ||
    savingRecurring ||
    preloadingHolidays ||
    Boolean(busyItemId);

  return (
    <VStack className="ad-page">
      <AdminConfigPageHeader
        eyebrow="Agenda del equipo"
        title="Horarios"
        subtitle="Elige los turnos fijos de cada manicurista, sus descansos y días cerrados."
        meta={
          isAnyBusy ? (
            <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
              Guardando...
            </Text>
          ) : saveNotice.message ? (
            <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
              <Check size={12} aria-hidden="true" />
              {saveNotice.message}
            </Text>
          ) : null
        }
        actions={
          !isSpecialistOnly ? (
            data.staff.length <= 5 ? (
              <HStack gap={1.5} wrap="wrap" role="group" aria-label="Elegir manicurista">
                {data.staff.map((st, idx) => {
                  const isSelected = st.id === staffId;
                  return (
                    <button
                      key={st.id}
                      type="button"
                      className="ad-pill ad-artist-pill fx-press"
                      data-on={isSelected ? 'true' : 'false'}
                      aria-pressed={isSelected}
                      disabled={savingWeekly}
                      onClick={() => handleSelectStaff(st.id)}
                    >
                      <Text className="ad-dot" data-idx={String(idx % 4)} aria-hidden="true">
                        {'\u200B'}
                      </Text>
                      <Text color="inherit" size="sm" weight="semibold">
                        {st.name}
                      </Text>
                    </button>
                  );
                })}
              </HStack>
            ) : (
              <Selector
                label="Manicurista"
                value={staffId}
                isDisabled={savingWeekly}
                onChange={(v) => v && handleSelectStaff(v)}
                options={data.staff.map((s) => ({ value: s.id, label: s.name }))}
              />
            )
          ) : null
        }
      />

      <AdminConfigKpiStrip ariaLabel="Resumen de horarios" items={kpiItems} cols={3} />

      {msg ? (
        <Banner
          status={msg.status}
          role={msg.status === 'error' ? 'alert' : 'status'}
          title={msg.text}
          isDismissable
          onDismiss={() => setMsg(null)}
        />
      ) : null}

      <TabList value={tab} onChange={setTab} hasDivider>
        <Tab value="weekly" label="Turnos de la semana" />
        <Tab
          value="breaks"
          label="Descansos y vacaciones"
          endContent={
            totalBreaksBadge > 0 ? (
              <Badge variant="neutral" label={String(totalBreaksBadge)} />
            ) : undefined
          }
        />
        <Tab value="help" label="¿Por qué no sale una hora?" />
      </TabList>

      {tab === 'weekly' ? (
        <VStack key="tab-weekly" gap={4} className="fx-step-in">
          <AdminConfigSection
            id="weekly-schedule-heading"
            title={`Turnos de ${activeStaffMember?.name ?? 'la manicurista'}`}
            subtitle="Activa los días que trabaja y agrega o quita las horas exactas de sus turnos."
            actions={
              <HStack gap={2} align="center" wrap="wrap">
                {savingWeekly ? (
                  <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                    Guardando...
                  </Text>
                ) : isScheduleDirty ? (
                  <>
                    <AdminConfigChip
                      label="Sin guardar"
                      tone="warning"
                      className="fx-pop"
                    />
                    <Button
                      type="button"
                      label="Descartar"
                      variant="ghost"
                      size="sm"
                      icon={<RotateCcw size={14} aria-hidden="true" />}
                      isDisabled={savingWeekly}
                      onClick={() => setRulesDraft(null)}
                    />
                  </>
                ) : saveNotice.message ? (
                  <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
                    <Check size={12} aria-hidden="true" />
                    {saveNotice.message}
                  </Text>
                ) : null}
                <Button
                  type="button"
                  label={savingWeekly ? 'Guardando...' : 'Guardar horario'}
                  variant="primary"
                  size="sm"
                  icon={<Save size={15} aria-hidden="true" />}
                  isLoading={savingWeekly}
                  isDisabled={!isScheduleDirty || savingWeekly}
                  onClick={() => void saveWeekly()}
                />
              </HStack>
            }
          >
            <VStack
              as="ul"
              className={savingWeekly ? 'ad-row-list fx-busy' : 'ad-row-list'}
              aria-busy={savingWeekly || undefined}
              gap={0}
            >
              {DAYS.map(({ dow, label }) => {
                const dayRules = rules.filter((r) => r.dayOfWeek === dow);
                const enabled = dayRules.length > 0;
                const isFixedMode = dayRules.some(
                  (r) => (r.fixedStartTimes?.length ?? 0) > 0,
                );

                return (
                  <li
                    key={dow}
                    className="ad-row-item"
                    data-muted={!enabled ? 'true' : undefined}
                  >
                    <VStack gap={3} width="100%">
                      <HStack justify="between" align="center" wrap="wrap" gap={3}>
                        <Switch
                          label={label}
                          value={enabled}
                          onChange={(checked) => toggleDay(dow, checked)}
                        />

                        {enabled ? (
                          <HStack gap={2} align="center" wrap="wrap">
                            <SegmentedControl
                              label={`Tipo de horario para ${label}`}
                              size="sm"
                              value={isFixedMode ? 'fixed' : 'continuous'}
                              onChange={(val) =>
                                setDayScheduleMode(dow, val as 'fixed' | 'continuous')
                              }
                            >
                              <SegmentedControlItem value="fixed" label="Turnos fijos" />
                              <SegmentedControlItem value="continuous" label="Horario libre" />
                            </SegmentedControl>
                            <Button
                              type="button"
                              label="Copiar a L–V"
                              size="sm"
                              variant="ghost"
                              icon={<Copy size={13} aria-hidden="true" />}
                              onClick={() => copyDayToWeekdays(dow)}
                            />
                          </HStack>
                        ) : (
                          <AdminConfigChip label="Descanso" tone="neutral" />
                        )}
                      </HStack>

                      {enabled ? (
                        <VStack gap={3}>
                          {dayRules.map((rule) => {
                            const fixedList = rule.fixedStartTimes ?? [];
                            const windowOptions = FIXED_TIME_OPTIONS.filter(
                              (opt) =>
                                opt.value >= rule.startTime &&
                                opt.value < rule.endTime &&
                                !fixedList.includes(opt.value),
                            );
                            const selectedForRule = newFixedByRule[rule.id];
                            const pendingFixed: string =
                              selectedForRule &&
                              windowOptions.some((o) => o.value === selectedForRule)
                                ? selectedForRule
                                : (windowOptions[0]?.value ?? '');

                            return (
                              <VStack key={rule.id} gap={2}>
                                {isFixedMode ? (
                                  <VStack gap={2}>
                                    <HStack gap={1.5} align="center" wrap="wrap">
                                      {fixedList.map((time) => (
                                        <Token
                                          key={time}
                                          size="md"
                                          icon={<Clock size={12} aria-hidden="true" />}
                                          label={time}
                                          onRemove={() => removeFixedStartTime(rule.id, time)}
                                        />
                                      ))}
                                    </HStack>

                                    <HStack gap={2} align="center" wrap="wrap">
                                      {windowOptions.length > 0 ? (
                                        <>
                                          <Selector
                                            label={`Elegir hora para ${label}`}
                                            isLabelHidden
                                            size="sm"
                                            value={pendingFixed}
                                            onChange={(val) =>
                                              val &&
                                              setNewFixedByRule((prev) => ({
                                                ...prev,
                                                [rule.id]: val,
                                              }))
                                            }
                                            options={windowOptions}
                                          />
                                          <Button
                                            type="button"
                                            label="+ Agregar hora"
                                            size="sm"
                                            variant="secondary"
                                            onClick={() =>
                                              addFixedStartTime(rule.id, pendingFixed)
                                            }
                                          />
                                        </>
                                      ) : null}
                                      <HStack gap={1.5} align="center" wrap="wrap">
                                        <Text type="supporting" color="secondary" size="sm">
                                          Jornada:
                                        </Text>
                                        <Selector
                                          label={`Apertura ${label}`}
                                          isLabelHidden
                                          size="sm"
                                          value={rule.startTime}
                                          onChange={(val) =>
                                            val && updateRuleBoundary(rule.id, 'startTime', val)
                                          }
                                          options={TIME_OPTIONS}
                                        />
                                        <Text color="secondary" size="sm">
                                          a
                                        </Text>
                                        <Selector
                                          label={`Cierre ${label}`}
                                          isLabelHidden
                                          size="sm"
                                          value={rule.endTime}
                                          onChange={(val) =>
                                            val && updateRuleBoundary(rule.id, 'endTime', val)
                                          }
                                          options={TIME_OPTIONS}
                                        />
                                      </HStack>
                                    </HStack>
                                  </VStack>
                                ) : (
                                  <HStack gap={2} align="center" wrap="wrap">
                                    <Text type="supporting" color="secondary" size="sm">
                                      De
                                    </Text>
                                    <Selector
                                      label={`Inicio ${label}`}
                                      isLabelHidden
                                      size="sm"
                                      value={rule.startTime}
                                      onChange={(val) =>
                                        val && updateRuleBoundary(rule.id, 'startTime', val)
                                      }
                                      options={TIME_OPTIONS}
                                    />
                                    <Text color="secondary" size="sm">
                                      a
                                    </Text>
                                    <Selector
                                      label={`Fin ${label}`}
                                      isLabelHidden
                                      size="sm"
                                      value={rule.endTime}
                                      onChange={(val) =>
                                        val && updateRuleBoundary(rule.id, 'endTime', val)
                                      }
                                      options={TIME_OPTIONS}
                                    />
                                    <Button
                                      type="button"
                                      label="Quitar tramo"
                                      isIconOnly
                                      size="sm"
                                      variant="ghost"
                                      icon={<Trash2 size={14} aria-hidden="true" />}
                                      onClick={() =>
                                        updateRules((prev) =>
                                          prev.filter((r) => r.id !== rule.id),
                                        )
                                      }
                                    />
                                  </HStack>
                                )}
                              </VStack>
                            );
                          })}

                          {!isFixedMode ? (
                            <HStack gap={1.5}>
                              <Button
                                type="button"
                                label="+ Agregar otro tramo"
                                size="sm"
                                variant="secondary"
                                icon={<Plus size={13} aria-hidden="true" />}
                                onClick={() => addSplitShift(dow)}
                              />
                            </HStack>
                          ) : null}
                        </VStack>
                      ) : null}
                    </VStack>
                  </li>
                );
              })}
            </VStack>
          </AdminConfigSection>

          <Collapsible
            className="ad-disclosure"
            defaultIsOpen={false}
            trigger={
              <HStack gap={2} align="center">
                <SlidersHorizontal size={14} aria-hidden="true" />
                <Text weight="semibold" size="sm">
                  Opciones avanzadas de horario
                </Text>
              </HStack>
            }
          >
            <HStack justify="between" align="center" wrap="wrap" gap={3} paddingBlockStart={3}>
              <VStack gap={0.5} className="rb-grow">
                <Text weight="semibold" size="sm">
                  Aprovechar huecos en horario libre
                </Text>
                <Text type="supporting" color="secondary">
                  Cuando un día está en Horario libre, acomoda el siguiente espacio justo al terminar la cita anterior. Nunca cambia tus turnos fijos.
                </Text>
              </VStack>
              {isOwner ? (
                <Switch
                  label="Aprovechar huecos en horario libre"
                  isLabelHidden
                  value={optimizeContinuousSlots}
                  isLoading={savingOptimize}
                  onChange={(checked) => void handleToggleOptimizeContinuous(checked)}
                />
              ) : (
                <AdminConfigChip
                  tone={optimizeContinuousSlots ? 'success' : 'neutral'}
                  label={optimizeContinuousSlots ? 'Activado' : 'Desactivado'}
                />
              )}
            </HStack>
          </Collapsible>

          {isScheduleDirty ? (
            <HStack
              className="ad-sticky-bar fx-sheet-in"
              justify="between"
              align="center"
              gap={3}
              wrap="wrap"
              role="region"
              aria-label="Cambios de horario sin guardar"
            >
              <HStack gap={2} align="center">
                <AdminConfigChip label="Sin guardar" tone="warning" />
                <Text size="sm" weight="medium">
                  Tienes cambios sin guardar en el horario de {activeStaffMember?.name ?? 'esta manicurista'}.
                </Text>
              </HStack>
              <HStack gap={2} align="center" wrap="wrap">
                <Button
                  type="button"
                  label="Descartar"
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={14} aria-hidden="true" />}
                  isDisabled={savingWeekly}
                  onClick={() => setRulesDraft(null)}
                />
                <Button
                  type="button"
                  label={savingWeekly ? 'Guardando...' : 'Guardar horario'}
                  variant="primary"
                  size="sm"
                  icon={<Save size={15} aria-hidden="true" />}
                  isLoading={savingWeekly}
                  isDisabled={savingWeekly}
                  onClick={() => void saveWeekly()}
                />
              </HStack>
            </HStack>
          ) : null}
        </VStack>
      ) : tab === 'breaks' ? (
        <VStack key="tab-breaks" gap={5} className="fx-step-in">
          <AdminConfigSection
            tone="accent"
            padded
            className={preloadingHolidays ? 'fx-busy' : undefined}
          >
            <HStack justify="between" align="center" wrap="wrap" gap={3}>
              <VStack gap={0.5} className="rb-grow">
                <HStack gap={1.5} align="center">
                  <CalendarPlus size={16} aria-hidden="true" />
                  <Text weight="semibold">Días festivos de México</Text>
                </HStack>
                <Text type="supporting" color="secondary">
                  Marca automáticamente como cerrados Año Nuevo, 1 de Mayo, 16 de Septiembre, Navidad y demás festivos oficiales para {activeStaffMember?.name ?? 'esta manicurista'}.
                </Text>
              </VStack>
              <HStack gap={2} align="center" wrap="wrap">
                <Selector
                  label="Año de festivos"
                  isLabelHidden
                  size="sm"
                  value={holidayYear}
                  isDisabled={preloadingHolidays}
                  onChange={(v) => v && setHolidayYear(v)}
                  options={HOLIDAY_YEAR_OPTIONS}
                />
                <Button
                  type="button"
                  label={
                    preloadingHolidays
                      ? 'Marcando festivos...'
                      : 'Marcar festivos de México'
                  }
                  variant="primary"
                  size="sm"
                  icon={<CalendarPlus size={14} aria-hidden="true" />}
                  isLoading={preloadingHolidays}
                  isDisabled={preloadingHolidays}
                  onClick={() => void handlePreloadMxHolidays()}
                />
              </HStack>
            </HStack>
          </AdminConfigSection>

          <VStack className="ad-split" gap={5}>
            <VStack gap={4}>
              <AdminConfigSection
                id="active-vacations-heading"
                icon={<CalendarOff size={16} aria-hidden="true" />}
                title="Vacaciones y días cerrados"
                subtitle={`Fechas especiales o vacaciones de ${activeStaffMember?.name ?? 'esta manicurista'}.`}
                badge={
                  <AdminConfigChip
                    label={String(activeOverrides.length)}
                    tone="neutral"
                    hasTabularNumbers
                  />
                }
              >
                {activeOverrides.length === 0 ? (
                  <AdminConfigEmpty
                    icon={<CalendarOff size={22} aria-hidden="true" />}
                    title="Sin vacaciones ni cierres próximos"
                    description="Cuando marques un día cerrado, vacaciones o festivos aparecerán aquí."
                  />
                ) : (
                  <VStack as="ul" className="ad-row-list" gap={0}>
                    {activeOverrides.map(renderClosedDateRow)}
                  </VStack>
                )}
              </AdminConfigSection>

              {archivedOverrides.length > 0 ? (
                <Collapsible
                  className="ad-disclosure"
                  defaultIsOpen={false}
                  trigger={
                    <HStack gap={2} align="center">
                      <Archive size={15} aria-hidden="true" />
                      <Text weight="semibold" size="sm">
                        Fechas pasadas
                      </Text>
                      <AdminConfigChip
                        label={String(archivedOverrides.length)}
                        tone="neutral"
                        hasTabularNumbers
                      />
                    </HStack>
                  }
                >
                  <VStack as="ul" className="ad-row-list" gap={0} paddingBlockStart={3}>
                    {archivedOverrides.map(renderClosedDateRow)}
                  </VStack>
                </Collapsible>
              ) : null}
            </VStack>

            <AdminConfigSection
              id="create-vacation-heading"
              title="Agregar vacaciones o día cerrado"
              subtitle="Cierra un día completo, varios días seguidos o pon un horario distinto."
            >
              <form onSubmit={addClosedDate}>
                <VStack
                  gap={3}
                  padding={5}
                  className={savingOverride ? 'fx-busy' : undefined}
                  aria-busy={savingOverride || undefined}
                >
                  <SegmentedControl
                    label="Cuántos días quieres cambiar"
                    size="sm"
                    layout="fill"
                    value={ovrMode}
                    onChange={(val) => setOvrMode(val === 'range' ? 'range' : 'single')}
                  >
                    <SegmentedControlItem value="single" label="Un día" />
                    <SegmentedControlItem value="range" label="Varios días" />
                  </SegmentedControl>

                  {ovrMode === 'single' ? (
                    <TextInput
                      label="Fecha (AAAA-MM-DD)"
                      value={ovrDate}
                      onChange={setOvrDateInput}
                      isRequired
                    />
                  ) : (
                    <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
                      <TextInput
                        label="Desde"
                        placeholder="AAAA-MM-DD"
                        value={ovrDate}
                        onChange={setOvrDateInput}
                        isRequired
                      />
                      <TextInput
                        label="Hasta"
                        placeholder="AAAA-MM-DD"
                        value={ovrEndDate}
                        onChange={setOvrEndDateInput}
                        isRequired
                      />
                    </Grid>
                  )}

                  <Switch
                    label="Cerrado todo el día"
                    value={ovrClosed}
                    onChange={setOvrClosed}
                  />
                  {!ovrClosed ? (
                    <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
                      <Selector
                        label="Abre a las"
                        value={ovrStart}
                        onChange={(v) => v && setOvrStart(v)}
                        options={TIME_OPTIONS}
                      />
                      <Selector
                        label="Cierra a las"
                        value={ovrEnd}
                        onChange={(v) => v && setOvrEnd(v)}
                        options={TIME_OPTIONS}
                      />
                    </Grid>
                  ) : null}

                  <TextInput
                    label="Motivo (solo para ti)"
                    placeholder="Ej. Vacaciones, curso o asunto personal"
                    value={ovrReason}
                    onChange={setOvrReason}
                  />

                  <Divider />

                  <Collapsible
                    className="ad-disclosure"
                    defaultIsOpen={Boolean(ovrPublicNote || ovrRedirectStaffId)}
                    trigger={
                      <Text weight="semibold" size="sm">
                        Aviso para tus clientas (opcional)
                      </Text>
                    }
                  >
                    <VStack gap={3} paddingBlockStart={3}>
                      <TextInput
                        label="Mensaje visible en la agenda"
                        description="Si lo dejas vacío, tus clientas nunca verán el motivo privado."
                        placeholder="Ej. Estaré en curso — puedes agendar con Paty"
                        value={ovrPublicNote}
                        onChange={setOvrPublicNote}
                        isOptional
                      />
                      <Selector
                        label="Sugerir a otra manicurista"
                        value={ovrRedirectStaffId}
                        onChange={(v) => setOvrRedirectStaffId(v ?? '')}
                        options={redirectStaffOptions}
                      />
                    </VStack>
                  </Collapsible>

                  <Button
                    type="submit"
                    label={
                      savingOverride
                        ? 'Guardando...'
                        : ovrMode === 'range'
                          ? 'Guardar vacaciones'
                          : 'Guardar fecha'
                    }
                    variant="primary"
                    width="100%"
                    icon={<Save size={15} aria-hidden="true" />}
                    isLoading={savingOverride}
                    isDisabled={savingOverride}
                  />
                </VStack>
              </form>
            </AdminConfigSection>
          </VStack>

          <Divider />

          <VStack className="ad-split" gap={5}>
            <AdminConfigSection
              id="recurring-breaks-heading"
              icon={<Coffee size={16} aria-hidden="true" />}
              title="Descansos fijos"
              subtitle={`Horarios que se repiten cada semana o cada mes para ${activeStaffMember?.name ?? 'esta manicurista'}.`}
              badge={
                <AdminConfigChip
                  label={String(staffRecurringBlocks.length)}
                  tone="neutral"
                  hasTabularNumbers
                />
              }
            >
              {staffRecurringBlocks.length === 0 ? (
                <AdminConfigEmpty
                  icon={<Coffee size={22} aria-hidden="true" />}
                  title="Sin descansos fijos"
                  description="Agrega aquí tu hora de comida, esterilización o clases para que nadie reserve encima."
                />
              ) : (
                <VStack as="ul" className="ad-row-list" gap={0}>
                  {staffRecurringBlocks.map((block) => {
                    const isBusy = busyItemId === block.id;
                    return (
                      <li
                        key={block.id}
                        className={isBusy ? 'ad-row-item fx-busy' : 'ad-row-item'}
                        data-muted={!block.isActive ? 'true' : undefined}
                        aria-busy={isBusy || undefined}
                      >
                        <VStack gap={1} className="rb-grow">
                          <HStack gap={2} align="center" wrap="wrap">
                            <Text weight="semibold">{block.reason}</Text>
                            <AdminConfigChip
                              tone={block.isActive ? 'success' : 'neutral'}
                              label={block.isActive ? 'Activo' : 'Pausado'}
                            />
                          </HStack>
                          <Text type="supporting" color="secondary" hasTabularNumbers>
                            {formatRecurringSummary(block)}
                          </Text>
                        </VStack>

                        <HStack gap={1.5} align="center">
                          <Button
                            type="button"
                            label={
                              isBusy
                                ? 'Guardando...'
                                : block.isActive
                                  ? 'Pausar'
                                  : 'Activar'
                            }
                            variant="secondary"
                            size="sm"
                            icon={
                              block.isActive ? (
                                <Pause size={13} aria-hidden="true" />
                              ) : (
                                <Play size={13} aria-hidden="true" />
                              )
                            }
                            isLoading={isBusy}
                            isDisabled={isBusy || Boolean(busyItemId)}
                            onClick={() => void handleToggleRecurringBlock(block)}
                          />
                          <Button
                            type="button"
                            label="Quitar"
                            isIconOnly
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 size={14} aria-hidden="true" />}
                            isDisabled={isBusy || Boolean(busyItemId)}
                            onClick={() => void handleDeleteRecurringBlock(block)}
                          />
                        </HStack>
                      </li>
                    );
                  })}
                </VStack>
              )}
            </AdminConfigSection>

            <AdminConfigSection
              id="create-recurring-break-heading"
              title="Agregar descanso fijo"
              subtitle="Ideal para tu hora de comida o limpieza semanal sin bloquear día por día."
            >
              <form onSubmit={createRecurringBreak}>
                <VStack
                  gap={3}
                  padding={5}
                  className={savingRecurring ? 'fx-busy' : undefined}
                  aria-busy={savingRecurring || undefined}
                >
                  <SegmentedControl
                    label="Con qué frecuencia se repite"
                    size="sm"
                    layout="fill"
                    value={recFrequency}
                    onChange={(val) => setRecFrequency(val as 'weekly' | 'monthly')}
                  >
                    <SegmentedControlItem value="weekly" label="Cada semana" />
                    <SegmentedControlItem value="monthly" label="Cada mes" />
                  </SegmentedControl>

                  {recFrequency === 'weekly' ? (
                    <VStack gap={1.5}>
                      <Text type="label" weight="semibold">
                        Días de la semana
                      </Text>
                      <Grid columns={{ minWidth: 80, max: 4 }} gap={1.5}>
                        {DAYS.map(({ dow, short }) => (
                          <CheckboxInput
                            key={dow}
                            size="sm"
                            label={short}
                            value={recWeekdays.includes(dow)}
                            onChange={(checked) => toggleRecWeekday(dow, checked)}
                          />
                        ))}
                      </Grid>
                    </VStack>
                  ) : (
                    <NumberInput
                      label="Día del mes (1 al 31)"
                      value={recDayOfMonth}
                      min={1}
                      max={31}
                      isIntegerOnly
                      onChange={(val) => setRecDayOfMonth(val || 1)}
                    />
                  )}

                  <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
                    <Selector
                      label="Desde"
                      value={recStartTime}
                      onChange={(v) => v && setRecStartTime(v)}
                      options={FIXED_TIME_OPTIONS}
                    />
                    <Selector
                      label="Hasta"
                      value={recEndTime}
                      onChange={(v) => v && setRecEndTime(v)}
                      options={FIXED_TIME_OPTIONS}
                    />
                  </Grid>

                  <TextInput
                    label="Nombre del descanso"
                    placeholder="Ej. Comida y limpieza de herramienta"
                    value={recReason}
                    onChange={setRecReason}
                    isRequired
                  />

                  <TextInput
                    label="Termina el (opcional, AAAA-MM-DD)"
                    placeholder="Déjalo vacío para que siempre se repita"
                    value={recUntilDate}
                    autoCapitalize="none"
                    hasAutoCorrect={false}
                    hasSpellCheck={false}
                    onChange={setRecUntilDate}
                  />

                  <Button
                    type="submit"
                    label={savingRecurring ? 'Guardando...' : 'Agregar descanso fijo'}
                    variant="primary"
                    width="100%"
                    icon={<Plus size={14} aria-hidden="true" />}
                    isLoading={savingRecurring}
                    isDisabled={savingRecurring}
                  />
                </VStack>
              </form>
            </AdminConfigSection>
          </VStack>
        </VStack>
      ) : (
        <VStack key="tab-help" className="fx-step-in" gap={0}>
          <VisualTroubleshooter
            staffId={staffId}
            staffMembers={data.staff}
            services={data.services}
            isSpecialistOnly={isSpecialistOnly}
            todayKey={data.serverTodayKey}
            timezone={data.settings.timezone}
            onSelectStaff={handleSelectStaff}
          />
        </VStack>
      )}
    </VStack>
  );
}
