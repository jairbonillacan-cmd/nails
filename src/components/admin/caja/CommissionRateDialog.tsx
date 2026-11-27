'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Percent } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { StaffMember } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FormDialog } from '@/components/ui/FormDialog';
import { previewStaffCommission } from './cajaMetrics';
import type { CommissionStaffRow } from './cajaTypes';

interface CommissionRateDialogProps {
  staffMember: StaffMember | null;
  staffRow: CommissionStaffRow | null;
  retailCommissionPercent: number;
  periodLabel: string;
  currency: 'MXN' | 'USD';
  onOpenChange: (open: boolean) => void;
  onSaveCommission: (
    staffMember: StaffMember,
    nextPercent: number,
  ) => Promise<FormSubmitResult>;
}

const COMMISSION_FORM_ID = 'caja-commission-rate-form';
const PERCENT_PRESETS = [30, 40, 50, 60] as const;

function CommissionRateFormBody({
  staffMember,
  staffRow,
  retailCommissionPercent,
  periodLabel,
  currency,
  percent,
  onPercentChange,
  onSubmit,
}: {
  staffMember: StaffMember;
  staffRow: CommissionStaffRow | null;
  retailCommissionPercent: number;
  periodLabel: string;
  currency: 'MXN' | 'USD';
  percent: number;
  onPercentChange: (next: number) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const money = (cents: number) => formatCurrency(cents, currency);
  const preview = staffRow ? previewStaffCommission(staffRow, clamped) : null;
  const currentPreview = staffRow
    ? previewStaffCommission(staffRow, staffMember.commissionPercent)
    : null;
  const delta = preview && currentPreview ? preview.totalPayout - currentPreview.totalPayout : 0;

  return (
    <form id={COMMISSION_FORM_ID} onSubmit={onSubmit}>
      <VStack gap={4}>
        <VStack gap={2}>
          <NumberInput
            label="Comisión por servicios (%)"
            description={`Actual: ${staffMember.commissionPercent}%. Aplica sobre servicios cobrados.`}
            value={percent}
            min={0}
            max={100}
            isIntegerOnly
            onChange={onPercentChange}
          />
          <HStack gap={1.5} wrap="wrap" role="group" aria-label="Porcentajes rápidos">
            {PERCENT_PRESETS.map((pct) => (
              <Button
                key={pct}
                type="button"
                label={`${pct}%`}
                size="sm"
                variant={clamped === pct ? 'primary' : 'secondary'}
                className="ad-caja-preset-chip"
                aria-pressed={clamped === pct}
                onClick={() => onPercentChange(pct)}
              />
            ))}
          </HStack>
        </VStack>

        {staffRow && preview ? (
          <VStack gap={1.5}>
            <Text type="supporting" color="secondary">
              Vista previa · {periodLabel}
            </Text>
            <VStack className="ad-subpanel ad-caja-reconcile" gap={0}>
              <HStack justify="between" align="center" gap={2} className="ad-kv-row">
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Servicios {money(staffRow.serviceSales)} × {clamped}%
                </Text>
                <Text weight="medium" hasTabularNumbers>
                  {money(preview.serviceCommission)}
                </Text>
              </HStack>
              <HStack justify="between" align="center" gap={2} className="ad-kv-row">
                <Text type="supporting" color="secondary" hasTabularNumbers>
                  Productos {money(staffRow.retailSales)} × {retailCommissionPercent}%
                </Text>
                <Text weight="medium" hasTabularNumbers>
                  {money(staffRow.retailCommission)}
                </Text>
              </HStack>
              {staffRow.otherCommission > 0 ? (
                <HStack justify="between" align="center" gap={2} className="ad-kv-row">
                  <Text type="supporting" color="secondary">
                    Otras comisiones registradas
                  </Text>
                  <Text weight="medium" hasTabularNumbers>
                    {money(staffRow.otherCommission)}
                  </Text>
                </HStack>
              ) : null}
              <HStack justify="between" align="center" gap={2} className="ad-kv-row">
                <Text type="supporting" color="secondary">
                  Propinas
                </Text>
                <Text weight="medium" hasTabularNumbers>
                  {money(staffRow.tips)}
                </Text>
              </HStack>
              <HStack justify="between" align="center" gap={2} className="ad-kv-row">
                <Text weight="semibold">Total a entregar</Text>
                <Text weight="bold" hasTabularNumbers>
                  {money(preview.totalPayout)}
                </Text>
              </HStack>
            </VStack>
            {delta !== 0 ? (
              <Text type="supporting" color="secondary" hasTabularNumbers role="status">
                {delta > 0 ? '+' : '−'}
                {money(Math.abs(delta))} frente al {staffMember.commissionPercent}% actual.
              </Text>
            ) : null}
            <Text type="supporting" color="secondary">
              La comisión de productos ({retailCommissionPercent}%) se cambia en Personalizar caja.
            </Text>
          </VStack>
        ) : null}
      </VStack>
    </form>
  );
}

export function CommissionRateDialog({
  staffMember,
  staffRow,
  retailCommissionPercent,
  periodLabel,
  currency,
  onOpenChange,
  onSaveCommission,
}: CommissionRateDialogProps) {
  const [percent, setPercent] = useState<number>(staffMember?.commissionPercent ?? 0);
  const clamped = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const isUnchanged = staffMember ? clamped === staffMember.commissionPercent : true;

  return (
    <FormDialog
      isOpen={Boolean(staffMember)}
      onOpenChange={onOpenChange}
      title={
        staffMember ? `Comisión de ${staffMember.name}` : 'Editar porcentaje de comisión'
      }
      subtitle="Se guarda en su perfil y recalcula los totales al instante."
      submitFooter={{
        formId: COMMISSION_FORM_ID,
        submitLabel: `Guardar ${clamped}%`,
        submitIcon: <Percent size={14} aria-hidden="true" />,
        isSubmitDisabled: isUnchanged,
      }}
    >
      {(controls) =>
        staffMember ? (
          <CommissionRateFormBody
            staffMember={staffMember}
            staffRow={staffRow}
            retailCommissionPercent={retailCommissionPercent}
            periodLabel={periodLabel}
            currency={currency}
            percent={percent}
            onPercentChange={setPercent}
            onSubmit={(e) => {
              e.preventDefault();
              controls.submit(() => onSaveCommission(staffMember, clamped));
            }}
          />
        ) : null
      }
    </FormDialog>
  );
}
