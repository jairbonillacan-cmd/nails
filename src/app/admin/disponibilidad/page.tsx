'use client';

import React, { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
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
import { List, ListItem } from '@astryxdesign/core/List';
import {
  Archive,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Pause,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { VisualTroubleshooter } from '@/components/admin/disponibilidad/VisualTroubleshooter';
import type { AvailabilityRule, DateOverride, RecurringBlock } from '@/lib/types';

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
      ? `Semanal (${block.weekdays.map((d) => WEEKDAY_SHORT_BY_DOW[d] ?? String(d)).join(', ')})`
      : `Mensual (día ${block.dayOfMonth ?? 1})`;
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
  const { data, refresh } = useAdminData();
  const [tab, setTab] = useState('weekly');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [rulesDraft, setRulesDraft] = useState<AvailabilityRule[] | null>(null);
  const [newFixedByRule, setNewFixedByRule] = useState<Record<string, string>>({});
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingOptimize, setSavingOptimize] = useState(false);
  const [msg, setMsg] = useState<{ status: 'success' | 'error'; text: string } | null>(null);

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
  const [showArchivedOverrides, setShowArchivedOverrides] = useState(false);

  const [recFrequency, setRecFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [recWeekdays, setRecWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [recDayOfMonth, setRecDayOfMonth] = useState<number>(15);
  const [recStartTime, setRecStartTime] = useState('12:30');
  const [recEndTime, setRecEndTime] = useState('13:15');
  const [recReason, setRecReason] = useState('');
  const [recUntilDate, setRecUntilDate] = useState('');
  const [savingRecurring, setSavingRecurring] = useState(false);

  if (!data) return null;

  const isOwner = data.session.user.role === 'owner';
  const isSpecialistOnly =
    data.session.user.role === 'specialist' && Boolean(data.session.user.staffMemberId);

  const staffId = isSpecialistOnly
    ? (data.session.user.staffMemberId ?? '')
    : (selectedStaffId ?? data.staff[0]?.id ?? '');

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
    { value: '', label: 'Sin redirección' },
    ...data.staff
      .filter((s) => s.isActive && s.id !== staffId)
      .map((s) => ({ value: s.id, label: `Sugerir a ${s.name}` })),
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
      text: 'Horario copiado de lunes a viernes. Recuerda guardar cambios.',
    });
  };

  const saveWeekly = async () => {
    if (!isScheduleDirty) return;
    setSavingWeekly(true);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, rules }),
      });
      if (res.ok) {
        setRulesDraft(null);
        setMsg({
          status: 'success',
          text: 'Horarios semanales guardados y sincronizados con la agenda pública.',
        });
        await refresh();
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text:
            errJson?.error ||
            'Revisa que los horarios fijos estén dentro de la ventana laboral.',
        });
      }
    } finally {
      setSavingWeekly(false);
    }
  };

  const handleToggleOptimizeContinuous = async (nextVal: boolean) => {
    if (!isOwner) return;
    setSavingOptimize(true);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optimizeContinuousSlots: nextVal }),
      });
      if (res.ok) {
        setMsg({
          status: 'success',
          text: nextVal
            ? 'Franjas optimizadas activadas para días en modo Rango continuo (los turnos fijos no cambian).'
            : 'Franjas optimizadas desactivadas.',
        });
        await refresh();
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo actualizar la preferencia de franjas.',
        });
      }
    } finally {
      setSavingOptimize(false);
    }
  };

  const addOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ovrDate) return;
    setSavingOverride(true);
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
        setOvrReason('');
        setOvrPublicNote('');
        setOvrRedirectStaffId('');
        setMsg({
          status: 'success',
          text:
            ovrMode === 'range'
              ? `Rango guardado (${json.overrides?.length ?? 1} día(s) del ${ovrDate} al ${ovrEndDate}).`
              : `Excepción guardada para ${ovrDate}.`,
        });
        await refresh();
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo guardar la excepción.',
        });
      }
    } finally {
      setSavingOverride(false);
    }
  };

  const handlePreloadMxHolidays = async () => {
    setPreloadingHolidays(true);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'preload_mx_holidays',
          year: Number(holidayYear) || 2026,
          staffId,
          publicNote: 'Cerrado por día festivo oficial en México',
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
        setMsg({
          status: 'success',
          text: `Festivos oficiales MX ${json.year ?? holidayYear}: ${createdCount} agregado(s), ${skippedCount} ya existente(s) omitido(s).`,
        });
        await refresh();
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudieron precargar los festivos oficiales.',
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

  const createRecurringBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffId) return;
    if (recFrequency === 'weekly' && recWeekdays.length === 0) {
      setMsg({
        status: 'error',
        text: 'Selecciona al menos un día de la semana para el bloqueo recurrente.',
      });
      return;
    }
    if (recStartTime >= recEndTime) {
      setMsg({
        status: 'error',
        text: 'La hora de inicio debe ser menor a la hora de fin.',
      });
      return;
    }
    setSavingRecurring(true);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'recurring_block',
          staffId,
          reason: recReason.trim() || 'Bloqueo recurrente',
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
        setRecReason('');
        setRecUntilDate('');
        setMsg({
          status: 'success',
          text: 'Bloqueo recurrente guardado y aplicado a la disponibilidad.',
        });
        await refresh();
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        setMsg({
          status: 'error',
          text: errJson?.error || 'No se pudo crear el bloqueo recurrente.',
        });
      }
    } finally {
      setSavingRecurring(false);
    }
  };

  const handleToggleRecurringBlock = async (block: RecurringBlock) => {
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
      setMsg({
        status: 'success',
        text: block.isActive
          ? `Bloqueo "${block.reason}" pausado.`
          : `Bloqueo "${block.reason}" reactivado.`,
      });
      await refresh();
    } else {
      const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
      setMsg({
        status: 'error',
        text: errJson?.error || 'No se pudo actualizar el bloqueo recurrente.',
      });
    }
  };

  const handleDeleteRecurringBlock = async (block: RecurringBlock) => {
    const res = await fetch(
      `/api/admin/availability?blockId=${encodeURIComponent(block.id)}`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      setMsg({
        status: 'success',
        text: `Bloqueo "${block.reason}" eliminado.`,
      });
      await refresh();
    } else {
      const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
      setMsg({
        status: 'error',
        text: errJson?.error || 'No se pudo eliminar el bloqueo recurrente.',
      });
    }
  };

  const staffOverrides = data.dateOverrides
    .filter((o) => o.staffId === staffId)
    .toSorted((a, b) => a.overrideDate.localeCompare(b.overrideDate));
  const activeOverrides = staffOverrides.filter((o) => o.overrideDate >= data.serverTodayKey);
  const archivedOverrides = staffOverrides
    .filter((o) => o.overrideDate < data.serverTodayKey)
    .toSorted((a, b) => b.overrideDate.localeCompare(a.overrideDate));

  const staffRecurringBlocks = data.recurringBlocks.filter((b) => b.staffId === staffId);
  const activeRecurringCount = staffRecurringBlocks.filter((b) => b.isActive).length;

  const renderOverrideItem = (o: DateOverride) => {
    const redirectStaff = o.redirectStaffId
      ? data.staff.find((s) => s.id === o.redirectStaffId)
      : null;
    return (
      <ListItem
        key={o.id}
        label={o.overrideDate}
        description={
          <VStack gap={1}>
            <Text type="supporting" color="secondary">
              {o.isUnavailable
                ? `Cerrado todo el día · ${o.reason}`
                : `${o.startTime} – ${o.endTime} · ${o.reason}`}
            </Text>
            {o.publicNote || redirectStaff ? (
              <HStack gap={1.5} wrap="wrap">
                {o.publicNote ? (
                  <Token size="sm" label={`Nota pública: ${o.publicNote}`} />
                ) : null}
                {redirectStaff ? (
                  <Token size="sm" color="green" label={`Redirige a ${redirectStaff.name}`} />
                ) : null}
              </HStack>
            ) : null}
          </VStack>
        }
        endContent={
          <Button
            type="button"
            label="Eliminar"
            variant="ghost"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={async () => {
              await fetch(`/api/admin/availability?id=${o.id}`, {
                method: 'DELETE',
              });
              await refresh();
            }}
          />
        }
      />
    );
  };

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Disponibilidad y Horarios</Heading>
          <Text color="secondary">
            Configura turnos fijos (como 10:00 · 13:30 · 16:30), bloqueos recurrentes, vacaciones, festivos MX y diagnóstico visual.
          </Text>
        </VStack>

        {!isSpecialistOnly ? (
          <Selector
            label="Especialista"
            value={staffId}
            onChange={(v) => v && handleSelectStaff(v)}
            options={data.staff.map((s) => ({ value: s.id, label: s.name }))}
          />
        ) : null}
      </HStack>

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
        <Tab value="weekly" label="Horario semanal (fijos y tramos)" />
        <Tab
          value="recurring"
          label="Bloqueos recurrentes"
          endContent={
            activeRecurringCount > 0 ? (
              <Badge variant="warning" label={String(activeRecurringCount)} />
            ) : undefined
          }
        />
        <Tab
          value="overrides"
          label="Excepciones y vacaciones"
          endContent={
            activeOverrides.length > 0 ? (
              <Badge variant="neutral" label={String(activeOverrides.length)} />
            ) : undefined
          }
        />
        <Tab value="troubleshoot" label="Diagnóstico visual" />
      </TabList>

      {tab === 'weekly' ? (
        <Card padding={5}>
          <VStack gap={4}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <VStack gap={0.5}>
                <Heading level={3}>Horario laboral ({data.settings.timezone})</Heading>
                <Text type="supporting" color="secondary">
                  Elige por día entre Turnos fijos (Karla/Paty 10:00 · 13:30 · 16:30; Tere 14:00 · 16:00 · 18:00) o Rango continuo.
                </Text>
              </VStack>
              <HStack gap={2} align="center" wrap="wrap">
                {isScheduleDirty ? (
                  <Token size="sm" color="orange" label="Cambios sin guardar" />
                ) : null}
                <Button
                  type="button"
                  label="Guardar horario"
                  variant="primary"
                  icon={<Save size={15} />}
                  isLoading={savingWeekly}
                  isDisabled={!isScheduleDirty || savingWeekly}
                  onClick={() => void saveWeekly()}
                />
              </HStack>
            </HStack>

            <Divider />

            <VStack gap={0}>
              {DAYS.map(({ dow, label }, dayIndex) => {
                const dayRules = rules.filter((r) => r.dayOfWeek === dow);
                const enabled = dayRules.length > 0;
                const isFixedMode = dayRules.some(
                  (r) => (r.fixedStartTimes?.length ?? 0) > 0,
                );

                return (
                  <React.Fragment key={dow}>
                    {dayIndex > 0 ? <Divider /> : null}
                    <VStack gap={3} paddingBlock={3}>
                      <HStack justify="between" align="center" wrap="wrap" gap={3}>
                        <Switch
                          label={label}
                          value={enabled}
                          onChange={(checked) => toggleDay(dow, checked)}
                        />

                        {enabled ? (
                          <HStack gap={2} align="center" wrap="wrap">
                            <SegmentedControl
                              label={`Modo de horarios ${label}`}
                              size="sm"
                              value={isFixedMode ? 'fixed' : 'continuous'}
                              onChange={(val) =>
                                setDayScheduleMode(dow, val as 'fixed' | 'continuous')
                              }
                            >
                              <SegmentedControlItem value="fixed" label="Turnos fijos" />
                              <SegmentedControlItem
                                value="continuous"
                                label="Rango continuo"
                              />
                            </SegmentedControl>
                            <Button
                              type="button"
                              label="Copiar a L–V"
                              size="sm"
                              variant="ghost"
                              icon={<Copy size={13} />}
                              onClick={() => copyDayToWeekdays(dow)}
                            />
                          </HStack>
                        ) : (
                          <Text type="supporting" color="secondary">
                            No laborable
                          </Text>
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
                                <HStack gap={2} align="center" wrap="wrap">
                                  <Text type="supporting" color="secondary">
                                    Ventana:
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
                                  <Text color="secondary">a</Text>
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
                                  {!isFixedMode ? (
                                    <Button
                                      type="button"
                                      label="Quitar tramo"
                                      isIconOnly
                                      size="sm"
                                      variant="ghost"
                                      icon={<Trash2 size={14} />}
                                      onClick={() =>
                                        updateRules((prev) =>
                                          prev.filter((r) => r.id !== rule.id),
                                        )
                                      }
                                    />
                                  ) : null}
                                </HStack>

                                {isFixedMode ? (
                                  <VStack gap={1.5}>
                                    <HStack gap={1.5} align="center" wrap="wrap">
                                      {fixedList.map((time) => (
                                        <Token
                                          key={time}
                                          size="md"
                                          icon={<Clock size={12} />}
                                          label={time}
                                          onRemove={() =>
                                            removeFixedStartTime(rule.id, time)
                                          }
                                        />
                                      ))}
                                    </HStack>

                                    {windowOptions.length > 0 ? (
                                      <HStack gap={2} align="center" wrap="wrap">
                                        <Selector
                                          label={`Nuevo turno fijo ${label}`}
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
                                          label="Agregar turno fijo"
                                          size="sm"
                                          variant="secondary"
                                          icon={<Plus size={13} />}
                                          onClick={() =>
                                            addFixedStartTime(rule.id, pendingFixed)
                                          }
                                        />
                                      </HStack>
                                    ) : null}
                                  </VStack>
                                ) : null}
                              </VStack>
                            );
                          })}

                          {!isFixedMode ? (
                            <HStack gap={1.5}>
                              <Button
                                type="button"
                                label="Agregar turno"
                                size="sm"
                                variant="secondary"
                                icon={<Plus size={13} />}
                                onClick={() => addSplitShift(dow)}
                              />
                            </HStack>
                          ) : null}
                        </VStack>
                      ) : null}
                    </VStack>
                  </React.Fragment>
                );
              })}
            </VStack>

            <Divider />

            <Card variant="muted" padding={4}>
              <HStack justify="between" align="center" wrap="wrap" gap={3}>
                <VStack gap={0.5}>
                  <HStack gap={1.5} align="center">
                    <Sparkles size={15} aria-hidden="true" />
                    <Text weight="semibold">
                      Franjas optimizadas (solo en modo Rango continuo)
                    </Text>
                  </HStack>
                  <Text type="supporting" color="secondary">
                    Ancla horarios al fin real de citas existentes para eliminar huecos muertos; nunca modifica turnos fijos como los de Karla, Paty y Tere.
                  </Text>
                </VStack>
                {isOwner ? (
                  <Switch
                    label="Activar franjas optimizadas"
                    isLabelHidden
                    value={optimizeContinuousSlots}
                    isLoading={savingOptimize}
                    onChange={(checked) => void handleToggleOptimizeContinuous(checked)}
                  />
                ) : (
                  <Badge
                    variant={optimizeContinuousSlots ? 'success' : 'neutral'}
                    label={optimizeContinuousSlots ? 'Activado' : 'Desactivado'}
                  />
                )}
              </HStack>
            </Card>
          </VStack>
        </Card>
      ) : tab === 'recurring' ? (
        <Grid columns={{ minWidth: 300, max: 2 }} gap={5} align="start">
          <Card padding={5}>
            <form onSubmit={createRecurringBlock}>
              <VStack gap={3}>
                <VStack gap={0.5}>
                  <Heading level={3}>Crear bloqueo recurrente</Heading>
                  <Text type="supporting" color="secondary">
                    Bloquea comida, esterilización o cursos cada semana o cada mes sin crear excepciones una por una.
                  </Text>
                </VStack>

                <SegmentedControl
                  label="Frecuencia del bloqueo"
                  size="sm"
                  value={recFrequency}
                  onChange={(val) => setRecFrequency(val as 'weekly' | 'monthly')}
                >
                  <SegmentedControlItem value="weekly" label="Semanal" />
                  <SegmentedControlItem value="monthly" label="Mensual" />
                </SegmentedControl>

                {recFrequency === 'weekly' ? (
                  <VStack gap={1.5}>
                    <Text type="label" weight="semibold">
                      Días de la semana
                    </Text>
                    <Grid columns={{ minWidth: 96, max: 4 }} gap={1.5}>
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
                    label="Día del mes (1–31)"
                    value={recDayOfMonth}
                    min={1}
                    max={31}
                    onChange={(val) => setRecDayOfMonth(val || 1)}
                  />
                )}

                <Grid columns={2} gap={2}>
                  <Selector
                    label="Hora inicio"
                    value={recStartTime}
                    onChange={(v) => v && setRecStartTime(v)}
                    options={FIXED_TIME_OPTIONS}
                  />
                  <Selector
                    label="Hora fin"
                    value={recEndTime}
                    onChange={(v) => v && setRecEndTime(v)}
                    options={FIXED_TIME_OPTIONS}
                  />
                </Grid>

                <TextInput
                  label="Motivo del bloqueo"
                  placeholder="Ej. Comida y esterilización de instrumental"
                  value={recReason}
                  onChange={setRecReason}
                  isRequired
                />

                <TextInput
                  label="Repetir hasta (opcional, YYYY-MM-DD)"
                  placeholder="Sin límite si se deja vacío"
                  value={recUntilDate}
                  autoCapitalize="none"
                  hasAutoCorrect={false}
                  hasSpellCheck={false}
                  onChange={setRecUntilDate}
                />

                <Button
                  type="submit"
                  label="Crear bloqueo recurrente"
                  variant="primary"
                  width="100%"
                  icon={<Plus size={14} />}
                  isLoading={savingRecurring}
                  isDisabled={savingRecurring}
                />
              </VStack>
            </form>
          </Card>

          <Card padding={5}>
            <VStack gap={3}>
              <HStack justify="between" align="center">
                <Heading level={3}>Bloqueos recurrentes activos</Heading>
                <Badge variant="neutral" label={String(staffRecurringBlocks.length)} />
              </HStack>

              {staffRecurringBlocks.length === 0 ? (
                <Text type="supporting" color="secondary">
                  Sin bloqueos recurrentes configurados para esta especialista.
                </Text>
              ) : (
                <List hasDividers>
                  {staffRecurringBlocks.map((block) => (
                    <ListItem
                      key={block.id}
                      label={block.reason}
                      description={
                        <VStack gap={1}>
                          <Text type="supporting" color="secondary">
                            {formatRecurringSummary(block)}
                          </Text>
                          <HStack gap={1.5}>
                            <Badge
                              variant={block.isActive ? 'success' : 'neutral'}
                              label={block.isActive ? 'Activo' : 'Pausado'}
                            />
                          </HStack>
                        </VStack>
                      }
                      endContent={
                        <HStack gap={1}>
                          <Button
                            type="button"
                            label={block.isActive ? 'Pausar' : 'Reanudar'}
                            variant="secondary"
                            size="sm"
                            icon={
                              block.isActive ? <Pause size={13} /> : <Play size={13} />
                            }
                            onClick={() => void handleToggleRecurringBlock(block)}
                          />
                          <Button
                            type="button"
                            label="Eliminar"
                            isIconOnly
                            variant="ghost"
                            size="sm"
                            icon={<Trash2 size={14} />}
                            onClick={() => void handleDeleteRecurringBlock(block)}
                          />
                        </HStack>
                      }
                    />
                  ))}
                </List>
              )}
            </VStack>
          </Card>
        </Grid>
      ) : tab === 'overrides' ? (
        <VStack gap={5}>
          <Card variant="muted" padding={4}>
            <HStack justify="between" align="center" wrap="wrap" gap={3}>
              <VStack gap={0.5}>
                <HStack gap={1.5} align="center">
                  <CalendarPlus size={16} aria-hidden="true" />
                  <Text weight="semibold">Festivos oficiales de México (LFT)</Text>
                </HStack>
                <Text type="supporting" color="secondary">
                  Bloquea en 1 clic Año Nuevo, Constitución, Benito Juárez, 1 de Mayo, 16 de Septiembre, Revolución y Navidad sin sobrescribir tus excepciones previas.
                </Text>
              </VStack>
              <HStack gap={2} align="center" wrap="wrap">
                <Selector
                  label="Año de festivos"
                  isLabelHidden
                  size="sm"
                  value={holidayYear}
                  onChange={(v) => v && setHolidayYear(v)}
                  options={HOLIDAY_YEAR_OPTIONS}
                />
                <Button
                  type="button"
                  label="Precargar festivos oficiales MX"
                  variant="secondary"
                  size="sm"
                  icon={<CalendarPlus size={14} />}
                  isLoading={preloadingHolidays}
                  onClick={() => void handlePreloadMxHolidays()}
                />
              </HStack>
            </HStack>
          </Card>

          <Grid columns={{ minWidth: 300, max: 2 }} gap={5} align="start">
            <Card padding={5}>
              <form onSubmit={addOverride}>
                <VStack gap={3}>
                  <Heading level={3}>Agregar excepción o vacaciones</Heading>
                  <SegmentedControl
                    label="Tipo de rango de fecha"
                    size="sm"
                    layout="fill"
                    value={ovrMode}
                    onChange={(val) => setOvrMode(val === 'range' ? 'range' : 'single')}
                  >
                    <SegmentedControlItem value="single" label="Fecha única" />
                    <SegmentedControlItem value="range" label="Rango de fechas" />
                  </SegmentedControl>

                  {ovrMode === 'single' ? (
                    <TextInput
                      label="Fecha (YYYY-MM-DD)"
                      value={ovrDate}
                      onChange={setOvrDateInput}
                      isRequired
                    />
                  ) : (
                    <Grid columns={2} gap={2}>
                      <TextInput
                        label="Fecha inicial (YYYY-MM-DD)"
                        value={ovrDate}
                        onChange={setOvrDateInput}
                        isRequired
                      />
                      <TextInput
                        label="Fecha final (YYYY-MM-DD)"
                        value={ovrEndDate}
                        onChange={setOvrEndDateInput}
                        isRequired
                      />
                    </Grid>
                  )}

                  <Switch
                    label="Día cerrado / sin disponibilidad todo el día"
                    value={ovrClosed}
                    onChange={setOvrClosed}
                  />
                  {!ovrClosed ? (
                    <Grid columns={2} gap={2}>
                      <Selector
                        label="Hora inicio"
                        value={ovrStart}
                        onChange={(v) => v && setOvrStart(v)}
                        options={TIME_OPTIONS}
                      />
                      <Selector
                        label="Hora fin"
                        value={ovrEnd}
                        onChange={(v) => v && setOvrEnd(v)}
                        options={TIME_OPTIONS}
                      />
                    </Grid>
                  ) : null}

                  <TextInput
                    label="Motivo interno (privado)"
                    placeholder="Ej. Vacaciones, curso técnico, asunto personal"
                    value={ovrReason}
                    onChange={setOvrReason}
                  />
                  <TextInput
                    label="Nota pública visible en /reservar (opcional)"
                    description="Si se deja vacía, las clientas nunca verán el motivo interno."
                    placeholder="Ej. En capacitación técnica — te atiende Paty"
                    value={ovrPublicNote}
                    onChange={setOvrPublicNote}
                    isOptional
                  />
                  <Selector
                    label="Redirigir a compañera disponible (opcional)"
                    value={ovrRedirectStaffId}
                    onChange={(v) => setOvrRedirectStaffId(v ?? '')}
                    options={redirectStaffOptions}
                  />
                  <Button
                    type="submit"
                    label={ovrMode === 'range' ? 'Guardar rango de fechas' : 'Guardar excepción'}
                    variant="primary"
                    width="100%"
                    isLoading={savingOverride}
                  />
                </VStack>
              </form>
            </Card>

            <VStack gap={4}>
              <Card padding={5}>
                <VStack gap={3}>
                  <HStack justify="between" align="center">
                    <Heading level={3}>Excepciones activas y próximas</Heading>
                    <Badge variant="neutral" label={String(activeOverrides.length)} />
                  </HStack>
                  {activeOverrides.length === 0 ? (
                    <Text type="supporting" color="secondary">
                      Sin excepciones activas o futuras para esta especialista.
                    </Text>
                  ) : (
                    <List hasDividers>{activeOverrides.map(renderOverrideItem)}</List>
                  )}
                </VStack>
              </Card>

              <Card variant="muted" padding={4}>
                <VStack gap={3}>
                  <HStack justify="between" align="center" wrap="wrap" gap={2}>
                    <HStack gap={2} align="center">
                      <Archive size={16} aria-hidden="true" />
                      <Text weight="semibold">
                        Archivadas (fechas pasadas)
                      </Text>
                      <Badge variant="neutral" label={String(archivedOverrides.length)} />
                    </HStack>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      label={showArchivedOverrides ? 'Ocultar' : 'Mostrar'}
                      icon={
                        showArchivedOverrides ? (
                          <ChevronUp size={14} />
                        ) : (
                          <ChevronDown size={14} />
                        )
                      }
                      isDisabled={archivedOverrides.length === 0}
                      onClick={() => setShowArchivedOverrides((prev) => !prev)}
                    />
                  </HStack>
                  {showArchivedOverrides && archivedOverrides.length > 0 ? (
                    <List hasDividers>{archivedOverrides.map(renderOverrideItem)}</List>
                  ) : null}
                </VStack>
              </Card>
            </VStack>
          </Grid>
        </VStack>
      ) : (
        <VisualTroubleshooter
          staffId={staffId}
          staffMembers={data.staff}
          services={data.services}
          isSpecialistOnly={isSpecialistOnly}
          todayKey={data.serverTodayKey}
          timezone={data.settings.timezone}
          onSelectStaff={handleSelectStaff}
        />
      )}
    </VStack>
  );
}
