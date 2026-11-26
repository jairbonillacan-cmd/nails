'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Check, RotateCcw, Save, SlidersHorizontal } from 'lucide-react';
import { StatusTag, SurfaceCard } from '@/components/ui';
import type { AvailabilityRule } from '@/lib/types';
import {
  DAYS,
  addRuleFixedTime,
  copyDayRulesToWeekdays,
  removeRuleFixedTime,
  serializeRulesCanonical,
  switchDayRuleMode,
  toggleDayRule,
  updateRuleTimeBoundary,
  type DayOfWeek,
} from './scheduleConstants';
import { WeeklyDayRow } from './WeeklyDayRow';

interface WeeklyScheduleEditorProps {
  staffId: string;
  staffName: string;
  currentScheduleRules: AvailabilityRule[];
  isOwner: boolean;
  optimizeContinuousSlots: boolean;
  saveNoticeMessage: string | null;
  onRefresh: () => Promise<void>;
  onSavedNotice: (text: string) => void;
  onMessage: (msg: { status: 'success' | 'error'; text: string } | null) => void;
  onSavingStateChange: (isSaving: boolean) => void;
}

export function WeeklyScheduleEditor({
  staffId,
  staffName,
  currentScheduleRules,
  isOwner,
  optimizeContinuousSlots,
  saveNoticeMessage,
  onRefresh,
  onSavedNotice,
  onMessage,
  onSavingStateChange,
}: WeeklyScheduleEditorProps) {
  const [rulesDraft, setRulesDraft] = useState<AvailabilityRule[] | null>(null);
  const [newFixedByRule, setNewFixedByRule] = useState<Record<string, string>>({});
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [savingOptimize, setSavingOptimize] = useState(false);

  const rules = rulesDraft ?? currentScheduleRules;
  const isScheduleDirty =
    rulesDraft !== null &&
    serializeRulesCanonical(rules) !== serializeRulesCanonical(currentScheduleRules);

  const updateRules = (updater: (prev: AvailabilityRule[]) => AvailabilityRule[]) => {
    setRulesDraft((prev) => updater(prev ?? currentScheduleRules));
  };

  const handleCopyDayToWeekdays = (sourceDow: DayOfWeek) => {
    updateRules((prev) => copyDayRulesToWeekdays(prev, sourceDow));
    onMessage({
      status: 'success',
      text: 'Horario copiado de lunes a viernes. Pulsa Guardar horario para aplicar.',
    });
  };

  const saveWeekly = async () => {
    if (!isScheduleDirty || savingWeekly) return;
    setSavingWeekly(true);
    onSavingStateChange(true);
    onMessage(null);
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId, rules }),
      });
      if (res.ok) {
        await onRefresh();
        setRulesDraft(null);
        onSavedNotice('Horario guardado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onMessage({
          status: 'error',
          text:
            errJson?.error ||
            'Revisa que cada hora fija esté dentro del horario de apertura y cierre.',
        });
      }
    } catch {
      onMessage({ status: 'error', text: 'Error de conexión al guardar el horario.' });
    } finally {
      setSavingWeekly(false);
      onSavingStateChange(false);
    }
  };

  const handleToggleOptimizeContinuous = async (nextVal: boolean) => {
    if (!isOwner || savingOptimize) return;
    setSavingOptimize(true);
    onSavingStateChange(true);
    onMessage(null);
    try {
      const res = await fetch('/api/admin/brand', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optimizeContinuousSlots: nextVal }),
      });
      if (res.ok) {
        await onRefresh();
        onSavedNotice(nextVal ? 'Ajuste automático activado' : 'Ajuste automático desactivado');
      } else {
        const errJson = (await res.json().catch(() => null)) as { error?: string } | null;
        onMessage({ status: 'error', text: errJson?.error || 'No se pudo actualizar esta opción.' });
      }
    } finally {
      setSavingOptimize(false);
      onSavingStateChange(false);
    }
  };

  return (
    <VStack gap={4} className="fx-step-in">
      <SurfaceCard
        id="weekly-schedule-heading"
        title={`Turnos de ${staffName}`}
        subtitle="Activa los días que trabaja y agrega o quita las horas exactas de sus turnos."
        actions={
          <HStack gap={2} align="center" wrap="wrap">
            {savingWeekly ? (
              <Text className="fx-save-pill" data-state="saving" role="status" aria-live="polite">
                Guardando...
              </Text>
            ) : isScheduleDirty ? (
              <>
                <StatusTag label="Sin guardar" tone="warning" className="fx-pop" />
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
            ) : saveNoticeMessage ? (
              <Text className="fx-save-pill" data-state="saved" role="status" aria-live="polite">
                <Check size={12} aria-hidden="true" />
                {saveNoticeMessage}
              </Text>
            ) : null}
            <Button
              type="button"
              label={savingWeekly ? 'Guardando...' : 'Guardar horario'}
              variant={isScheduleDirty ? 'primary' : 'secondary'}
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
          {DAYS.map(({ dow, label }) => (
            <WeeklyDayRow
              key={dow}
              dow={dow}
              label={label}
              dayRules={rules.filter((r) => r.dayOfWeek === dow)}
              newFixedByRule={newFixedByRule}
              onSelectPendingFixed={(ruleId, val) =>
                setNewFixedByRule((prev) => ({ ...prev, [ruleId]: val }))
              }
              onToggleDay={(d, checked) => updateRules((prev) => toggleDayRule(prev, d, checked))}
              onChangeMode={(d, mode) => updateRules((prev) => switchDayRuleMode(prev, d, mode))}
              onCopyToWeekdays={handleCopyDayToWeekdays}
              onAddFixedTime={(ruleId, time) =>
                updateRules((prev) => addRuleFixedTime(prev, ruleId, time))
              }
              onRemoveFixedTime={(ruleId, time) =>
                updateRules((prev) => removeRuleFixedTime(prev, ruleId, time))
              }
              onUpdateBoundary={(ruleId, field, val) =>
                updateRules((prev) => updateRuleTimeBoundary(prev, ruleId, field, val))
              }
              onRemoveRule={(ruleId) =>
                updateRules((prev) => prev.filter((r) => r.id !== ruleId))
              }
              onAddSplitShift={(d) =>
                updateRules((prev) => [
                  ...prev,
                  { id: `r-${d}-${Date.now()}`, dayOfWeek: d, startTime: '15:00', endTime: '19:30' },
                ])
              }
            />
          ))}
        </VStack>
      </SurfaceCard>

      <Collapsible
        className="ad-disclosure"
        defaultIsOpen={false}
        trigger={
          <HStack gap={2} align="center">
            <SlidersHorizontal size={14} aria-hidden="true" />
            <Text weight="semibold" size="sm">
              Más opciones de horario
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
              Cuando un día está en Horario libre, acomoda el siguiente espacio justo al terminar la
              cita anterior. Nunca cambia tus turnos fijos.
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
            <StatusTag
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
          <HStack gap={2} align="center" wrap="wrap">
            <StatusTag label="Sin guardar" tone="warning" />
            <Text size="sm" weight="medium">
              Tienes cambios sin guardar en el horario de {staffName}.
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
  );
}
