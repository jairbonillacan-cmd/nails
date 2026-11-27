'use client';

import type React from 'react';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Percent } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { StaffMember } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FormDialog, type FormDialogControls } from '@/components/ui/FormDialog';
import type { CommissionStaffRow } from './cajaTypes';

interface CommissionRateDialogProps {
  staffMember: StaffMember | null;
  staffRow: CommissionStaffRow | null;
  currency: 'MXN' | 'USD';
  onOpenChange: (open: boolean) => void;
  onSaveCommission: (
    staffMember: StaffMember,
    nextPercent: number,
  ) => Promise<FormSubmitResult>;
}

const COMMISSION_FORM_ID = 'caja-commission-rate-form';

function CommissionRateFormBody({
  staffMember,
  staffRow,
  currency,
  onSaveCommission,
  controls,
}: {
  staffMember: StaffMember;
  staffRow: CommissionStaffRow | null;
  currency: 'MXN' | 'USD';
  onSaveCommission: (
    staffMember: StaffMember,
    nextPercent: number,
  ) => Promise<FormSubmitResult>;
  controls: FormDialogControls;
}) {
  const [percent, setPercent] = useState<number>(staffMember.commissionPercent);
  const clamped = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const previewSales = staffRow?.sales ?? 0;
  const previewCommission = Math.round((previewSales * clamped) / 100);
  const previewTips = staffRow?.tips ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    controls.submit(() => onSaveCommission(staffMember, clamped));
  };

  return (
    <form id={COMMISSION_FORM_ID} onSubmit={handleSubmit}>
      <VStack gap={3}>
        <NumberInput
          label="Porcentaje de comisión (%)"
          description="Aplica entre 0% y 100% sobre servicios cobrados."
          value={percent}
          min={0}
          max={100}
          isIntegerOnly
          onChange={setPercent}
        />

        {staffRow ? (
          <VStack className="ad-subpanel ad-caja-reconcile" gap={0}>
            <HStack justify="between" align="center" className="ad-kv-row">
              <Text type="supporting" color="secondary">
                Ventas en el periodo
              </Text>
              <Text weight="medium" hasTabularNumbers>
                {formatCurrency(previewSales, currency)}
              </Text>
            </HStack>
            <HStack justify="between" align="center" className="ad-kv-row">
              <Text type="supporting" color="secondary">
                Comisión estimada ({clamped}%)
              </Text>
              <Text weight="semibold" hasTabularNumbers>
                {formatCurrency(previewCommission, currency)}
              </Text>
            </HStack>
            <HStack justify="between" align="center" className="ad-kv-row">
              <Text type="supporting" color="secondary">
                Total con propinas
              </Text>
              <Text weight="bold" hasTabularNumbers>
                {formatCurrency(previewCommission + previewTips, currency)}
              </Text>
            </HStack>
          </VStack>
        ) : null}
      </VStack>
    </form>
  );
}

export function CommissionRateDialog({
  staffMember,
  staffRow,
  currency,
  onOpenChange,
  onSaveCommission,
}: CommissionRateDialogProps) {
  return (
    <FormDialog
      isOpen={Boolean(staffMember)}
      onOpenChange={onOpenChange}
      title={
        staffMember
          ? `Editar comisión · ${staffMember.name}`
          : 'Editar porcentaje de comisión'
      }
      subtitle="El cambio se guarda en el perfil de la profesional y recalcula los totales al instante."
      submitFooter={{
        formId: COMMISSION_FORM_ID,
        submitLabel: 'Guardar porcentaje',
        submitIcon: <Percent size={14} aria-hidden="true" />,
      }}
    >
      {(controls) =>
        staffMember ? (
          <CommissionRateFormBody
            staffMember={staffMember}
            staffRow={staffRow}
            currency={currency}
            onSaveCommission={onSaveCommission}
            controls={controls}
          />
        ) : null
      }
    </FormDialog>
  );
}
