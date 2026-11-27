'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { IconButton } from '@astryxdesign/core/IconButton';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Switch } from '@astryxdesign/core/Switch';
import { Check, Plus, RotateCcw, X } from 'lucide-react';
import {
  DEFAULT_CAJA_EXPENSE_CATEGORIES,
  normalizeExpenseCategories,
} from '@/lib/caja/caja-config';
import { CAJA_EXPENSE_CATEGORY_MAX } from '@/lib/contracts/brand';
import type { CajaConfig, CajaDefaultPeriod } from '@/lib/types';
import { formSubmitError, type FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import { FormDialog } from '@/components/ui/FormDialog';

const SETTINGS_FORM_ID = 'caja-settings-form';

const DEFAULT_PERIOD_OPTIONS: readonly FilterPillOption<CajaDefaultPeriod>[] = [
  { value: 'today', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: 'month', label: 'Este mes' },
  { value: 'all', label: 'Todo' },
];

const RETAIL_PERCENT_PRESETS = [5, 10, 15, 20] as const;

interface CajaSettingsDialogProps {
  config: CajaConfig;
  currency: 'MXN' | 'USD';
  onOpenChange: (open: boolean) => void;
  onSave: (config: CajaConfig) => Promise<FormSubmitResult>;
}

export function CajaSettingsDialog({
  config,
  currency,
  onOpenChange,
  onSave,
}: CajaSettingsDialogProps) {
  const [openingFloatMxn, setOpeningFloatMxn] = useState<number>(
    Number((config.openingFloatCents / 100).toFixed(2)),
  );
  const [categories, setCategories] = useState<string[]>(() => [...config.expenseCategories]);
  const [newCategory, setNewCategory] = useState('');
  const [retailPercent, setRetailPercent] = useState<number>(config.retailCommissionPercent);
  const [defaultPeriod, setDefaultPeriod] = useState<CajaDefaultPeriod>(config.defaultPeriod);
  const [includeStaffBreakdown, setIncludeStaffBreakdown] = useState(
    config.closeSummary.includeStaffBreakdown,
  );
  const [includeTips, setIncludeTips] = useState(config.closeSummary.includeTips);
  const [includePending, setIncludePending] = useState(config.closeSummary.includePending);

  const canAddCategory =
    newCategory.trim().length >= 2 && categories.length < CAJA_EXPENSE_CATEGORY_MAX;

  const handleAddCategory = () => {
    if (!canAddCategory) return;
    setCategories((current) => normalizeExpenseCategories([...current, newCategory]));
    setNewCategory('');
  };

  return (
    <FormDialog
      isOpen
      onOpenChange={onOpenChange}
      title="Personalizar caja"
      subtitle="Ajustes del arqueo, gastos rápidos, comisión de productos y resumen del corte."
      width="min(34rem, 96vw)"
      submitFooter={{
        formId: SETTINGS_FORM_ID,
        submitLabel: 'Guardar preferencias',
        submitIcon: <Check size={15} aria-hidden="true" />,
      }}
    >
      {(controls) => (
        <form
          id={SETTINGS_FORM_ID}
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            const cleanPercent = Math.round(retailPercent);
            if (!Number.isFinite(cleanPercent) || cleanPercent < 0 || cleanPercent > 100) {
              controls.submit(async () =>
                formSubmitError('La comisión de productos debe estar entre 0% y 100%.'),
              );
              return;
            }
            controls.submit(() =>
              onSave({
                openingFloatCents: Math.max(0, Math.round((openingFloatMxn || 0) * 100)),
                expenseCategories: normalizeExpenseCategories(categories),
                retailCommissionPercent: cleanPercent,
                defaultPeriod,
                closeSummary: { includeStaffBreakdown, includeTips, includePending },
              }),
            );
          }}
        >
          <VStack gap={5}>
            <VStack gap={2}>
              <Text weight="semibold">Arqueo diario</Text>
              <NumberInput
                label={`Fondo inicial de caja (${currency})`}
                description="Efectivo con el que abres el cajón cada día. Se suma al efectivo esperado del corte."
                value={openingFloatMxn}
                min={0}
                onChange={setOpeningFloatMxn}
              />
            </VStack>

            <VStack gap={2}>
              <Text weight="semibold">Comisión por venta de productos</Text>
              <NumberInput
                label="Porcentaje para la profesional que vende (%)"
                description="Aplica a todas las ventas de producto del periodo que consultes."
                value={retailPercent}
                min={0}
                max={100}
                isIntegerOnly
                onChange={setRetailPercent}
              />
              <HStack gap={1.5} wrap="wrap" role="group" aria-label="Porcentajes rápidos">
                {RETAIL_PERCENT_PRESETS.map((pct) => (
                  <Button
                    key={pct}
                    type="button"
                    label={`${pct}%`}
                    size="sm"
                    variant={retailPercent === pct ? 'primary' : 'secondary'}
                    className="ad-caja-preset-chip"
                    aria-pressed={retailPercent === pct}
                    onClick={() => setRetailPercent(pct)}
                  />
                ))}
              </HStack>
            </VStack>

            <VStack gap={2}>
              <HStack justify="between" align="center" gap={2} wrap="wrap">
                <Text weight="semibold">Categorías rápidas de gasto</Text>
                <Button
                  type="button"
                  label="Restablecer"
                  variant="ghost"
                  size="sm"
                  icon={<RotateCcw size={13} aria-hidden="true" />}
                  onClick={() => setCategories([...DEFAULT_CAJA_EXPENSE_CATEGORIES])}
                />
              </HStack>
              {categories.length === 0 ? (
                <Text type="supporting" color="secondary">
                  Sin categorías: al registrar un gasto solo escribirás el concepto.
                </Text>
              ) : (
                <VStack as="ul" className="ad-row-list ad-caja-category-list" gap={0}>
                  {categories.map((category, index) => (
                    <HStack
                      as="li"
                      key={`${category}-${index}`}
                      justify="between"
                      align="center"
                      gap={2}
                      className="ad-caja-category-row"
                    >
                      <TextInput
                        label={`Categoría ${index + 1}`}
                        isLabelHidden
                        size="sm"
                        value={category}
                        onChange={(next) =>
                          setCategories((current) =>
                            current.map((item, i) => (i === index ? next : item)),
                          )
                        }
                        containerClassName="rb-grow"
                      />
                      <IconButton
                        type="button"
                        size="sm"
                        variant="ghost"
                        label={`Quitar ${category}`}
                        icon={<X size={14} aria-hidden="true" />}
                        onClick={() =>
                          setCategories((current) => current.filter((_, i) => i !== index))
                        }
                      />
                    </HStack>
                  ))}
                </VStack>
              )}
              <HStack gap={2} align="end">
                <TextInput
                  label="Nueva categoría"
                  placeholder="Ej. Acetona"
                  value={newCategory}
                  onChange={setNewCategory}
                  containerClassName="rb-grow"
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory();
                    }
                  }}
                />
                <Button
                  type="button"
                  label="Agregar"
                  variant="secondary"
                  icon={<Plus size={14} aria-hidden="true" />}
                  isDisabled={!canAddCategory}
                  onClick={handleAddCategory}
                />
              </HStack>
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {categories.length} de {CAJA_EXPENSE_CATEGORY_MAX} categorías.
              </Text>
            </VStack>

            <VStack gap={2}>
              <Text weight="semibold">Periodo al abrir Caja</Text>
              <FilterPillBar
                ariaLabel="Periodo predeterminado"
                mode="segmented"
                size="sm"
                value={defaultPeriod}
                options={DEFAULT_PERIOD_OPTIONS}
                onChange={setDefaultPeriod}
              />
            </VStack>

            <VStack gap={2}>
              <Text weight="semibold">Resumen del corte para WhatsApp</Text>
              <Switch
                label="Incluir desglose por profesional"
                value={includeStaffBreakdown}
                onChange={setIncludeStaffBreakdown}
              />
              <Switch label="Incluir propinas" value={includeTips} onChange={setIncludeTips} />
              <Switch
                label="Incluir pendientes (citas sin cobrar y anticipos)"
                value={includePending}
                onChange={setIncludePending}
              />
            </VStack>
          </VStack>
        </form>
      )}
    </FormDialog>
  );
}
