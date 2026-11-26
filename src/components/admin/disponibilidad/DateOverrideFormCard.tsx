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
import type { FormDialogControls } from '@/components/ui/FormDialog';
import { FormDialogLauncher } from '@/components/ui/FormDialogLauncher';
import {
  FORM_SUBMIT_OK,
  formSubmitError,
  formSubmitResultFromResponse,
  type FormSubmitResult,
} from '@/lib/forms/form-submit';
import type { DateOverride, StaffMember } from '@/lib/types';
import { TIME_OPTIONS } from './scheduleConstants';

interface DateOverrideFormCardProps {
  staffId: string;
  allStaff: StaffMember[];
  serverTodayKey: string;
  onRefresh: () => Promise<void>;
  onSavedNotice: (text: string) => void;
}

export function DateOverrideFormCard(props: DateOverrideFormCardProps) {
  return (
    <FormDialogLauncher
      triggerLabel="Agregar fecha"
      title="Vacaciones o día cerrado"
      subtitle="Cierra uno o varios días, o pon un horario distinto."
      triggerVariant="secondary"
      triggerSize="sm"
      icon={<CalendarPlus size={14} aria-hidden="true" />}
    >
      {(controls) => <DateOverrideFormBody {...props} controls={controls} />}
    </FormDialogLauncher>
  );
}

function DateOverrideFormBody({
  staffId,
  allStaff,
  serverTodayKey,
  onRefresh,
  onSavedNotice,
  controls,
}: DateOverrideFormCardProps & { controls: FormDialogControls }) {
  const [ovrMode, setOvrMode] = useState<'single' | 'range'>('single');
  const [ovrDateInput, setOvrDateInput] = useState<string | null>(null);
  const [ovrEndDateInput, setOvrEndDateInput] = useState<string | null>(null);
  const [ovrClosed, setOvrClosed] = useState(true);
  const [ovrStart, setOvrStart] = useState('10:00');
  const [ovrEnd, setOvrEnd] = useState('16:00');
  const [ovrReason, setOvrReason] = useState('');
  const [ovrPublicNote, setOvrPublicNote] = useState('');
  const [ovrRedirectStaffId, setOvrRedirectStaffId] = useState('');
  const { isSubmitting } = controls;

  const ovrDate = ovrDateInput ?? serverTodayKey;
  const ovrEndDate = ovrEndDateInput && ovrEndDateInput >= ovrDate ? ovrEndDateInput : ovrDate;
  const redirectStaffOptions = [
    { value: '', label: 'Nadie' },
    ...allStaff
      .filter((s) => s.isActive && s.id !== staffId)
      .map((s) => ({ value: s.id, label: s.name })),
  ];

  const saveDate = async (): Promise<FormSubmitResult> => {
    if (!ovrClosed && ovrStart >= ovrEnd) {
      return formSubmitError('La hora de apertura debe ser antes que la de cierre.');
    }
    const cleanPublicNote = ovrPublicNote.trim();
    const cleanRedirect = ovrRedirectStaffId.trim() || null;
    const cleanReason = ovrReason.trim();
    const payload =
      ovrMode === 'range'
        ? {
            kind: 'override_range' as const,
            staffId,
            startDate: ovrDate,
            endDate: ovrEndDate,
            isClosed: ovrClosed,
            startTime: ovrClosed ? null : ovrStart,
            endTime: ovrClosed ? null : ovrEnd,
            reason: cleanReason || (ovrClosed ? 'Vacaciones / Días cerrados' : 'Horario especial'),
            ...(cleanPublicNote ? { publicNote: cleanPublicNote } : {}),
            redirectStaffId: cleanRedirect,
          }
        : {
            staffId,
            overrideDate: ovrDate,
            isUnavailable: ovrClosed,
            startTime: ovrClosed ? null : ovrStart,
            endTime: ovrClosed ? null : ovrEnd,
            reason: cleanReason || (ovrClosed ? 'Día cerrado' : 'Horario especial'),
            ...(cleanPublicNote ? { publicNote: cleanPublicNote } : {}),
            redirectStaffId: cleanRedirect,
          };

    const res = await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return formSubmitResultFromResponse(res, 'No se pudo guardar la fecha.');
    const json = (await res.json().catch(() => ({}))) as { overrides?: DateOverride[] };
    await onRefresh();
    onSavedNotice(
      ovrMode === 'range'
        ? `Fechas guardadas (${json.overrides?.length ?? 1} días)`
        : `Fecha guardada (${ovrDate})`,
    );
    return FORM_SUBMIT_OK;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ovrDate) return;
    controls.submit(saveDate);
  };

  return (
    <form onSubmit={handleSubmit}>
      <VStack gap={3}>
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
            value={ovrDate as ISODateString}
            min={serverTodayKey as ISODateString}
            onChange={(v) => setOvrDateInput(v ?? null)}
            isRequired
          />
        ) : (
          <Grid columns={{ minWidth: 130, max: 2 }} gap={2}>
            <DateInput
              label="Desde"
              value={ovrDate as ISODateString}
              min={serverTodayKey as ISODateString}
              onChange={(v) => setOvrDateInput(v ?? null)}
              isRequired
            />
            <DateInput
              label="Hasta"
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
          label="Motivo"
          description="Solo lo ves tú."
          placeholder="Ej. Vacaciones o curso"
          value={ovrReason}
          onChange={setOvrReason}
          isOptional
        />

        <Divider />

        <Collapsible
          className="ad-disclosure"
          defaultIsOpen={false}
          trigger={
            <Text weight="semibold" size="sm">
              Aviso para tus clientas
            </Text>
          }
        >
          <VStack gap={3} paddingBlockStart={3}>
            <TextInput
              label="Mensaje en tu página de citas"
              description="Si lo dejas vacío, tus clientas no verán el motivo."
              placeholder="Ej. Estoy de vacaciones, vuelvo el lunes"
              value={ovrPublicNote}
              onChange={setOvrPublicNote}
              isOptional
            />
            <Selector
              label="Recomendar a otra profesional"
              value={ovrRedirectStaffId}
              onChange={(v) => setOvrRedirectStaffId(v ?? '')}
              options={redirectStaffOptions}
            />
          </VStack>
        </Collapsible>

        <HStack gap={2} justify="end" wrap="wrap">
          <Button
            type="button"
            label="Cancelar"
            variant="secondary"
            isDisabled={isSubmitting}
            onClick={controls.close}
          />
          <Button
            type="submit"
            label={ovrMode === 'range' ? 'Guardar fechas' : 'Guardar fecha'}
            variant="primary"
            icon={<Save size={15} aria-hidden="true" />}
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          />
        </HStack>
      </VStack>
    </form>
  );
}
