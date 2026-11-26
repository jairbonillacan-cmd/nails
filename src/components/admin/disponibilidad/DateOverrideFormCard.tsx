'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Divider } from '@astryxdesign/core/Divider';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { DateInput } from '@astryxdesign/core/DateInput';
import type { ISODateString } from '@astryxdesign/core/Calendar';
import { HStack } from '@astryxdesign/core/HStack';
import { CalendarPlus, Save } from 'lucide-react';
import { FilterPillBar } from '@/components/ui';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';
import type { DateOverride, StaffMember } from '@/lib/types';
import { TIME_OPTIONS } from './scheduleConstants';

interface DateOverrideFormCardProps {
  staffId: string;
  allStaff: StaffMember[];
  serverTodayKey: string;
  onRefresh: () => Promise<void>;
  onSavedNotice: (text: string) => void;
  onMessage: (msg: { status: 'success' | 'error'; text: string } | null) => void;
}

export function DateOverrideFormCard(props: DateOverrideFormCardProps) {
  return (
    <FormDialogLauncher
      triggerLabel="Agregar fecha"
      title="Vacaciones o día cerrado"
      subtitle="Cierra uno o varios días, o pon un horario distinto."
      triggerVariant="secondary"
      icon={<CalendarPlus size={14} aria-hidden="true" />}
    >
      {(close) => <DateOverrideFormBody {...props} onDone={close} />}
    </FormDialogLauncher>
  );
}

function DateOverrideFormBody({
  staffId,
  allStaff,
  serverTodayKey,
  onRefresh,
  onSavedNotice,
  onMessage,
  onDone,
}: DateOverrideFormCardProps & { onDone: () => void }) {
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

  const ovrDate = ovrDateInput ?? serverTodayKey;
  const ovrEndDate = ovrEndDateInput ?? ovrDate;
  const redirectStaffOptions = [
    { value: '', label: 'Sin sugerir compañera' },
    ...allStaff
      .filter((s) => s.isActive && s.id !== staffId)
      .map((s) => ({ value: s.id, label: `Sugerir a ${s.name}` })),
  ];

  const addClosedDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ovrDate || savingOverride) return;
    setSavingOverride(true);
    onMessage(null);
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
              reason:
                ovrReason || (ovrClosed ? 'Vacaciones / Días cerrados' : 'Horario especial'),
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
        await onRefresh();
        setOvrReason('');
        setOvrPublicNote('');
        setOvrRedirectStaffId('');
        onDone();
        onSavedNotice(
          ovrMode === 'range'
            ? `Fechas guardadas (${json.overrides?.length ?? 1} días)`
            : `Fecha guardada (${ovrDate})`,
        );
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onMessage({ status: 'error', text: errJson?.error || 'No se pudo guardar la fecha.' });
      }
    } catch {
      onMessage({ status: 'error', text: 'Error de conexión al guardar la fecha.' });
    } finally {
      setSavingOverride(false);
    }
  };

  return (
      <form onSubmit={addClosedDate}>
        <VStack
          gap={3}
          className={savingOverride ? 'fx-busy' : undefined}
          aria-busy={savingOverride || undefined}
        >
          <FilterPillBar<'single' | 'range'>
            ariaLabel="Cuántos días quieres cambiar"
            mode="segmented"
            size="sm"
            layout="fill"
            value={ovrMode}
            onChange={setOvrMode}
            options={[
              { value: 'single', label: 'Un día' },
              { value: 'range', label: 'Varios días' },
            ]}
          />

          {ovrMode === 'single' ? (
            <DateInput
              label="Fecha"
              placeholder="Elige el día"
              value={ovrDate as ISODateString}
              min={serverTodayKey as ISODateString}
              onChange={(v) => setOvrDateInput(v ?? null)}
              isRequired
            />
          ) : (
            <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
              <DateInput
                label="Desde"
                placeholder="Primer día"
                value={ovrDate as ISODateString}
                min={serverTodayKey as ISODateString}
                onChange={(v) => setOvrDateInput(v ?? null)}
                isRequired
              />
              <DateInput
                label="Hasta"
                placeholder="Último día"
                value={ovrEndDate as ISODateString}
                min={ovrDate as ISODateString}
                onChange={(v) => setOvrEndDateInput(v ?? null)}
                isRequired
              />
            </Grid>
          )}

          <Switch label="Cerrado todo el día" value={ovrClosed} onChange={setOvrClosed} />
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

          <HStack gap={2} justify="end" wrap="wrap">
            <Button type="button" label="Cancelar" variant="secondary" isDisabled={savingOverride} onClick={onDone} />
            <Button
              type="submit"
              label={savingOverride ? 'Guardando...' : ovrMode === 'range' ? 'Guardar vacaciones' : 'Guardar fecha'}
              variant="primary"
              icon={<Save size={15} aria-hidden="true" />}
              isLoading={savingOverride}
              isDisabled={savingOverride}
            />
          </HStack>
        </VStack>
      </form>
  );
}
