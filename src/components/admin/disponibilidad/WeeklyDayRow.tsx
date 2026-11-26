'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { Token } from '@astryxdesign/core/Token';
import { Clock, Copy, Plus, Trash2 } from 'lucide-react';
import { FilterPillBar, StatusTag } from '@/components/ui';
import type { AvailabilityRule } from '@/lib/types';
import { FIXED_TIME_OPTIONS, TIME_OPTIONS, type DayOfWeek } from './scheduleConstants';

interface WeeklyDayRowProps {
  dow: DayOfWeek;
  label: string;
  dayRules: AvailabilityRule[];
  newFixedByRule: Record<string, string>;
  onSelectPendingFixed: (ruleId: string, time: string) => void;
  onToggleDay: (dow: DayOfWeek, enabled: boolean) => void;
  onChangeMode: (dow: DayOfWeek, mode: 'fixed' | 'continuous') => void;
  onCopyToWeekdays: (dow: DayOfWeek) => void;
  onAddFixedTime: (ruleId: string, time: string) => void;
  onRemoveFixedTime: (ruleId: string, time: string) => void;
  onUpdateBoundary: (ruleId: string, field: 'startTime' | 'endTime', val: string) => void;
  onRemoveRule: (ruleId: string) => void;
  onAddSplitShift: (dow: DayOfWeek) => void;
}

export function WeeklyDayRow({
  dow,
  label,
  dayRules,
  newFixedByRule,
  onSelectPendingFixed,
  onToggleDay,
  onChangeMode,
  onCopyToWeekdays,
  onAddFixedTime,
  onRemoveFixedTime,
  onUpdateBoundary,
  onRemoveRule,
  onAddSplitShift,
}: WeeklyDayRowProps) {
  const enabled = dayRules.length > 0;
  const isFixedMode = dayRules.some((r) => (r.fixedStartTimes?.length ?? 0) > 0);

  return (
    <li className="ad-row-item" data-muted={!enabled ? 'true' : undefined}>
      <VStack gap={3} width="100%">
        <HStack justify="between" align="center" wrap="wrap" gap={3}>
          <Switch label={label} value={enabled} onChange={(checked) => onToggleDay(dow, checked)} />
          {enabled ? (
            <HStack gap={2} align="center" wrap="wrap">
              <FilterPillBar<'fixed' | 'continuous'>
                ariaLabel={`Tipo de horario para ${label}`}
                mode="segmented"
                size="sm"
                value={isFixedMode ? 'fixed' : 'continuous'}
                onChange={(val) => onChangeMode(dow, val)}
                options={[
                  { value: 'fixed', label: 'Turnos fijos' },
                  { value: 'continuous', label: 'Horario libre' },
                ]}
              />
              <Button
                type="button"
                label="Copiar a L–V"
                size="sm"
                variant="ghost"
                icon={<Copy size={13} aria-hidden="true" />}
                onClick={() => onCopyToWeekdays(dow)}
              />
            </HStack>
          ) : (
            <StatusTag label="Descanso" tone="neutral" />
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
              const pendingFixed =
                selectedForRule && windowOptions.some((o) => o.value === selectedForRule)
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
                            onRemove={() => onRemoveFixedTime(rule.id, time)}
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
                              onChange={(val) => val && onSelectPendingFixed(rule.id, val)}
                              options={windowOptions}
                            />
                            <Button
                              type="button"
                              label="+ Agregar hora"
                              size="sm"
                              variant="secondary"
                              onClick={() => onAddFixedTime(rule.id, pendingFixed)}
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
                            onChange={(val) => val && onUpdateBoundary(rule.id, 'startTime', val)}
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
                            onChange={(val) => val && onUpdateBoundary(rule.id, 'endTime', val)}
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
                        onChange={(val) => val && onUpdateBoundary(rule.id, 'startTime', val)}
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
                        onChange={(val) => val && onUpdateBoundary(rule.id, 'endTime', val)}
                        options={TIME_OPTIONS}
                      />
                      <Button
                        type="button"
                        label="Quitar tramo"
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        icon={<Trash2 size={14} aria-hidden="true" />}
                        onClick={() => onRemoveRule(rule.id)}
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
                  onClick={() => onAddSplitShift(dow)}
                />
              </HStack>
            ) : null}
          </VStack>
        ) : null}
      </VStack>
    </li>
  );
}
