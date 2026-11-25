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
import { TextInput } from '@astryxdesign/core/TextInput';
import { Banner } from '@astryxdesign/core/Banner';
import { Badge } from '@astryxdesign/core/Badge';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { List, ListItem } from '@astryxdesign/core/List';
import { Copy, Plus, Save, Search, Trash2 } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import type { AvailabilityRule } from '@/lib/types';
import type { SlotDiagnosis } from '@/lib/availability/engine';

const DAYS: Array<{ dow: 0 | 1 | 2 | 3 | 4 | 5 | 6; label: string }> = [
  { dow: 1, label: 'Lunes' },
  { dow: 2, label: 'Martes' },
  { dow: 3, label: 'Miércoles' },
  { dow: 4, label: 'Jueves' },
  { dow: 5, label: 'Viernes' },
  { dow: 6, label: 'Sábado' },
  { dow: 0, label: 'Domingo' },
];

const TIME_OPTIONS = Array.from({ length: 27 }, (_, i) => {
  const totalMin = 8 * 60 + i * 30;
  const hh = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const mm = String(totalMin % 60).padStart(2, '0');
  return { value: `${hh}:${mm}`, label: `${hh}:${mm}` };
});

export default function AdminAvailabilityPage() {
  const { data, refresh } = useAdminData();
  const [tab, setTab] = useState('weekly');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [rulesDraft, setRulesDraft] = useState<AvailabilityRule[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [ovrDateInput, setOvrDateInput] = useState<string | null>(null);
  const [ovrClosed, setOvrClosed] = useState(true);
  const [ovrStart, setOvrStart] = useState('10:00');
  const [ovrEnd, setOvrEnd] = useState('16:00');
  const [ovrReason, setOvrReason] = useState('');

  const [diagDateInput, setDiagDateInput] = useState<string | null>(null);
  const [diagServiceInput, setDiagServiceInput] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<SlotDiagnosis[]>([]);

  if (!data) return null;

  const isSpecialistOnly =
    data.session.user.role === 'specialist' && Boolean(data.session.user.staffMemberId);

  const staffId = isSpecialistOnly
    ? (data.session.user.staffMemberId ?? '')
    : (selectedStaffId ?? data.staff[0]?.id ?? '');

  const currentScheduleRules =
    data.schedules.find((s) => s.staffId === staffId)?.rules ?? [];
  const rules = rulesDraft ?? currentScheduleRules;
  const ovrDate = ovrDateInput ?? data.serverTodayKey;
  const diagDate = diagDateInput ?? data.serverTodayKey;
  const diagServiceId = diagServiceInput ?? data.services[0]?.id ?? '';

  const updateRules = (updater: (prev: AvailabilityRule[]) => AvailabilityRule[]) => {
    setRulesDraft((prev) => updater(prev ?? currentScheduleRules));
  };

  const handleSelectStaff = (nextId: string) => {
    setSelectedStaffId(nextId);
    setRulesDraft(null);
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
          endTime: '18:00',
        },
      ]);
    }
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
        })),
      );
      return [...kept, ...copied];
    });
    setMsg('Horario copiado de lunes a viernes. Recuerda guardar cambios.');
  };

  const saveWeekly = async () => {
    await fetch('/api/admin/availability', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staffId, rules }),
    });
    setRulesDraft(null);
    setMsg('Horarios semanales guardados y sincronizados con la agenda pública.');
    await refresh();
  };

  const addOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ovrDate) return;
    await fetch('/api/admin/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffId,
        overrideDate: ovrDate,
        isUnavailable: ovrClosed,
        startTime: ovrClosed ? null : ovrStart,
        endTime: ovrClosed ? null : ovrEnd,
        reason: ovrReason || (ovrClosed ? 'Día cerrado' : 'Horario especial'),
      }),
    });
    setOvrReason('');
    setMsg(`Excepción guardada para ${ovrDate}.`);
    await refresh();
  };

  const runDiagnose = async () => {
    if (!diagDate || !diagServiceId || !staffId) return;
    const qs = new URLSearchParams({
      mode: 'diagnose',
      date: diagDate,
      serviceId: diagServiceId,
      staffId,
    });
    const res = await fetch(`/api/admin/availability?${qs.toString()}`);
    if (!res.ok) {
      setDiagnostics([]);
      return;
    }
    const json = await res.json();
    setDiagnostics(json.diagnosis ?? json.diagnostics ?? []);
  };

  const staffOverrides = data.dateOverrides.filter((o) => o.staffId === staffId);

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Disponibilidad y Horarios</Heading>
          <Text color="secondary">
            Configura turnos partidos (hora de comida), vacaciones y diagnostica por qué una hora aparece ocupada.
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
        <Banner status="success" title={msg} isDismissable onDismiss={() => setMsg(null)} />
      ) : null}

      <TabList value={tab} onChange={setTab} hasDivider>
        <Tab value="weekly" label="Horario semanal (tramos partidos)" />
        <Tab
          value="overrides"
          label="Excepciones y vacaciones"
          endContent={
            staffOverrides.length > 0 ? (
              <Badge variant="neutral" label={String(staffOverrides.length)} />
            ) : undefined
          }
        />
        <Tab value="troubleshoot" label="Diagnóstico (Troubleshooter)" />
      </TabList>

      {tab === 'weekly' ? (
        <Card padding={5}>
          <VStack gap={4}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <VStack gap={0}>
                <Heading level={3}>Horario laboral ({data.settings.timezone})</Heading>
                <Text type="supporting" color="secondary">
                  Usa + para agregar un segundo turno (por ejemplo, descanso de comida 14:00–15:00).
                </Text>
              </VStack>
              <Button
                label="Guardar horario"
                variant="primary"
                icon={<Save size={15} />}
                onClick={saveWeekly}
              />
            </HStack>

            <Divider />

            <VStack gap={3}>
              {DAYS.map(({ dow, label }) => {
                const dayRules = rules.filter((r) => r.dayOfWeek === dow);
                const enabled = dayRules.length > 0;
                return (
                  <Card key={dow} variant="muted" padding={3}>
                    <HStack justify="between" align="start" wrap="wrap" gap={3}>
                      <Switch
                        label={label}
                        value={enabled}
                        onChange={(checked) => toggleDay(dow, checked)}
                      />

                      {enabled ? (
                        <VStack gap={2}>
                          {dayRules.map((rule) => (
                            <HStack key={rule.id} gap={2} align="center" wrap="wrap">
                              <Selector
                                label="Inicio"
                                isLabelHidden
                                size="sm"
                                value={rule.startTime}
                                onChange={(val) =>
                                  val &&
                                  updateRules((prev) =>
                                    prev.map((r) =>
                                      r.id === rule.id ? { ...r, startTime: val } : r,
                                    ),
                                  )
                                }
                                options={TIME_OPTIONS}
                              />
                              <Text color="secondary">a</Text>
                              <Selector
                                label="Fin"
                                isLabelHidden
                                size="sm"
                                value={rule.endTime}
                                onChange={(val) =>
                                  val &&
                                  updateRules((prev) =>
                                    prev.map((r) =>
                                      r.id === rule.id ? { ...r, endTime: val } : r,
                                    ),
                                  )
                                }
                                options={TIME_OPTIONS}
                              />
                              <Button
                                label="Quitar tramo"
                                isIconOnly
                                size="sm"
                                variant="ghost"
                                icon={<Trash2 size={14} />}
                                onClick={() =>
                                  updateRules((prev) => prev.filter((r) => r.id !== rule.id))
                                }
                              />
                            </HStack>
                          ))}
                          <HStack gap={1.5}>
                            <Button
                              label="Agregar turno"
                              size="sm"
                              variant="secondary"
                              icon={<Plus size={13} />}
                              onClick={() => addSplitShift(dow)}
                            />
                            <Button
                              label="Copiar a L–V"
                              size="sm"
                              variant="ghost"
                              icon={<Copy size={13} />}
                              onClick={() => copyDayToWeekdays(dow)}
                            />
                          </HStack>
                        </VStack>
                      ) : (
                        <Text type="supporting" color="secondary">
                          No laborable
                        </Text>
                      )}
                    </HStack>
                  </Card>
                );
              })}
            </VStack>
          </VStack>
        </Card>
      ) : tab === 'overrides' ? (
        <Grid columns={{ minWidth: 300, max: 2 }} gap={5} align="start">
          <Card padding={5}>
            <form onSubmit={addOverride}>
              <VStack gap={3}>
                <Heading level={3}>Agregar excepción por fecha</Heading>
                <TextInput
                  label="Fecha (YYYY-MM-DD)"
                  value={ovrDate}
                  onChange={setOvrDateInput}
                  isRequired
                />
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
                  label="Motivo (interno)"
                  placeholder="Ej. Vacaciones, curso técnico, día festivo"
                  value={ovrReason}
                  onChange={setOvrReason}
                />
                <Button type="submit" label="Guardar excepción" variant="primary" width="100%" />
              </VStack>
            </form>
          </Card>

          <Card padding={5}>
            <VStack gap={3}>
              <Heading level={3}>Excepciones programadas</Heading>
              {staffOverrides.length === 0 ? (
                <Text type="supporting" color="secondary">
                  Sin excepciones registradas para esta especialista.
                </Text>
              ) : (
                <List hasDividers>
                  {staffOverrides.map((o) => (
                    <ListItem
                      key={o.id}
                      label={o.overrideDate}
                      description={
                        <Text type="supporting" color="secondary">
                          {o.isUnavailable
                            ? `Cerrado todo el día · ${o.reason}`
                            : `${o.startTime} – ${o.endTime} · ${o.reason}`}
                        </Text>
                      }
                      endContent={
                        <Button
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
                  ))}
                </List>
              )}
            </VStack>
          </Card>
        </Grid>
      ) : (

        <Card padding={5}>
          <VStack gap={4}>
            <VStack gap={0.5}>
              <Heading level={3}>¿Por qué no aparece un horario disponible?</Heading>
              <Text type="supporting" color="secondary">
                Inspecciona hora por hora si un espacio está libre o bloqueado por descanso, cita activa, apartado de 3 min o Google Calendar.
              </Text>
            </VStack>

            <HStack gap={3} align="end" wrap="wrap">
              <TextInput
                label="Fecha (YYYY-MM-DD)"
                value={diagDate}
                onChange={setDiagDateInput}
              />
              <Selector
                label="Servicio"
                value={diagServiceId}
                onChange={(v) => v && setDiagServiceInput(v)}
                options={data.services.map((s) => ({ value: s.id, label: s.name }))}
              />
              <Button
                label="Diagnosticar fecha"
                variant="primary"
                icon={<Search size={15} />}
                onClick={runDiagnose}
              />
            </HStack>

            {diagnostics.length > 0 ? (
              <List hasDividers>
                {diagnostics.map((d) => (
                  <ListItem
                    key={d.time24}
                    label={`${d.time24} hrs`}
                    description={
                      <Text type="supporting" color="secondary">
                        {d.reason}
                      </Text>
                    }
                    endContent={
                      <Badge
                        variant={d.isAvailable ? 'success' : 'neutral'}
                        label={d.isAvailable ? 'Disponible' : 'Bloqueado'}
                      />
                    }
                  />
                ))}
              </List>
            ) : null}
          </VStack>
        </Card>
      )}
    </VStack>
  );
}
