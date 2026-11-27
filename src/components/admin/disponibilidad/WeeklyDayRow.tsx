'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Switch } from '@astryxdesign/core/Switch';
import { Selector } from '@astryxdesign/core/Selector';
import { Token } from '@astryxdesign/core/Token';
import { Check, Clock, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { FilterPillBar, StatusTag } from '@/components/ui';
import type { AvailabilityRule } from '@/lib/types';
import {
  FIXED_TIME_OPTIONS,
  TIME_OPTIONS,
  formatDayScheduleSummary,
  type DayOfWeek,
} from './scheduleConstants';

interface WeeklyDayRowProps {
  dow: DayOfWeek;
  label: string;
  short: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
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
  short,
  isExpanded,
  onToggleExpand,
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
  const summary = formatDayScheduleSummary(dayRules);

  return (
    <li className="ad-row-item" data-muted={!enabled && !isExpanded ? 'true' : undefined}>
      <VStack gap={2} width="100%">
        <HStack justify="between" align="center" gap={2} wrap="wrap">
          <HStack
            gap={2}
            align="center"
            wrap="wrap"
            style={{ flex: '1 1 13rem', minWidth: 0 }}
          >
            {enabled ? (
              <Text size="sm" hasTabularNumbers>
                <Text as="span" weight="semibold" size="sm">
                  {short}
                </Text>
                {' · '}
                {summary}
              </Text>
            ) : (
              <>
                <Text weight="semibold" size="sm">
                  {short}
                </Text>
                <StatusTag label="Descanso" tone="neutral" />
              </>
            )}
          </HStack>

          <Button
            type="button"
            label={isExpanded ? 'Listo' : 'Editar'}
            size="sm"
            variant={isExpanded ? 'secondary' : 'ghost'}
            icon={
              isExpanded ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Pencil size={14} aria-hidden="true" />
              )
            }
            aria-expanded={isExpanded}
            onClick={onToggleExpand}
          />
        </HStack>

        {isExpanded ? (
          <VStack gap={3} className="fx-step-in">
            <Divider />
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <Switch
                size="sm"
                label={enabled ? `${label} activo` : `${label} en descanso`}
                value={enabled}
                onChange={(checked) => onToggleDay(dow, checked)}
              />
              {enabled ? (
                <HStack gap={1.5} align="center" wrap="wrap">
                  <FilterPillBar<'fixed' | 'continuous'>
                    ariaLabel={`Tipo de horario para ${label}`}
                    mode="segmented"
                    size="sm"
                    value={isFixedMode ? 'fixed' : 'continuous'}
                    onChange={(val) => onChangeMode(dow, val)}
                    options={[
                      { value: 'fixed', label: 'Horas fijas' },
                      { value: 'continuous', label: 'Citas seguidas' },
                    ]}
                  />
                  <Button
                    type="button"
                    label="Igual lun a vie"
                    size="sm"
                    variant="ghost"
                    icon={<Copy size={13} aria-hidden="true" />}
                    onClick={() => onCopyToWeekdays(dow)}
                  />
                </HStack>
              ) : null}
            </HStack>

            {enabled ? (
              <VStack gap={1.5}>
                {dayRules.map((rule, ruleIndex) => {
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
                  const isLastRule = ruleIndex === dayRules.length - 1;

                  return (
                    <VStack key={rule.id} gap={1.5}>
                      {isFixedMode ? (
                        <HStack justify="between" align="center" gap={2} wrap="wrap">
                          <HStack
                            gap={1}
                            align="center"
                            wrap="wrap"
                            style={{ flex: '1 1 16rem', minWidth: 0 }}
                          >
                            {fixedList.map((time) => (
                              <Token
                                key={time}
                                size="sm"
                                icon={<Clock size={11} aria-hidden="true" />}
                                label={time}
                                onRemove={() => onRemoveFixedTime(rule.id, time)}
                              />
                            ))}
                            {windowOptions.length > 0 ? (
                              <HStack gap={1} align="center">
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
                                  label="Agregar"
                                  size="sm"
                                  variant="secondary"
                                  icon={<Plus size={13} aria-hidden="true" />}
                                  onClick={() => onAddFixedTime(rule.id, pendingFixed)}
                                />
                              </HStack>
                            ) : null}
                          </HStack>

                          <HStack gap={1} align="center" wrap="wrap">
                            <Text type="supporting" color="secondary" size="sm">
                              Jornada
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
                              –
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
                      ) : (
                        <HStack justify="between" align="center" gap={1.5} wrap="wrap">
                          <HStack gap={1.5} align="center" wrap="wrap">
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
                          {isLastRule ? (
                            <Button
                              type="button"
                              label="Agregar tramo"
                              size="sm"
                              variant="secondary"
                              icon={<Plus size={13} aria-hidden="true" />}
                              onClick={() => onAddSplitShift(dow)}
                            />
                          ) : null}
                        </HStack>
                      )}
                    </VStack>
                  );
                })}
              </VStack>
            ) : (
              <Text type="supporting" color="secondary" size="sm">
                Activa el día para configurar sus turnos u horario continuo.
              </Text>
            )}
          </VStack>
        ) : null}
      </VStack>
    </li>
  );
}
