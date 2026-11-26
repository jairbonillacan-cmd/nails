'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import {
  CalendarCheck,
  MessageCircle,
  RefreshCw,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { SurfaceCard } from '@/components/ui/SurfaceCard';

interface CitaModifyCardProps {
  bookingCode: string;
  cancellationPolicyText: string;
  minCancelHours: number;
  minRescheduleHours: number;
  rescheduleWindowAllowed: boolean;
  cancelWindowAllowed: boolean;
  policyHelpWhatsappUrl: string;
  touchUpUrl: string;
  onOpenReschedule: () => void;
  onOpenCancel: () => void;
}

export function CitaModifyCard({
  bookingCode,
  cancellationPolicyText,
  minCancelHours,
  minRescheduleHours,
  rescheduleWindowAllowed,
  cancelWindowAllowed,
  policyHelpWhatsappUrl,
  touchUpUrl,
  onOpenReschedule,
  onOpenCancel,
}: CitaModifyCardProps) {
  const isRescheduleLocked = !rescheduleWindowAllowed;
  const isCancelLocked = !cancelWindowAllowed;
  const isAnyPolicyLocked = isRescheduleLocked || isCancelLocked;
  const policyHours = Math.max(minCancelHours, minRescheduleHours);

  return (
    <SurfaceCard
      id="ck-manage-title"
      headingLevel={2}
      title="¿Necesitas hacer un cambio?"
      subtitle={
        cancellationPolicyText ||
        `Puedes reagendar o cancelar en línea hasta ${policyHours} h antes de tu cita.`
      }
      padded
      className="ck-panel fx-fade-up"
    >
      <VStack gap={3}>
        {isAnyPolicyLocked ? (
          <Banner
            status="warning"
            title={`Faltan menos de ${policyHours} h; escríbenos por WhatsApp para ayudarte`}
            description={
              isRescheduleLocked && isCancelLocked
                ? `Los cambios y cancelaciones en línea cierran ${policyHours} h antes de tu horario. Escríbenos directo y con gusto revisamos tu cita ${bookingCode}.`
                : isCancelLocked
                  ? `La cancelación en línea cierra ${minCancelHours} h antes de tu cita. Escríbenos por WhatsApp si necesitas ayuda.`
                  : `La reprogramación en línea cierra ${minRescheduleHours} h antes de tu cita. Escríbenos por WhatsApp si necesitas ayuda.`
            }
          />
        ) : null}
        <HStack gap={2} wrap="wrap">
          {isAnyPolicyLocked ? (
            <Button
              label="Escribir por WhatsApp"
              variant="primary"
              size="md"
              className="fx-press"
              icon={<MessageCircle size={15} aria-hidden="true" />}
              href={policyHelpWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          ) : null}
          {!isRescheduleLocked ? (
            <Button
              type="button"
              label="Reagendar"
              variant="secondary"
              size="md"
              className="fx-press"
              icon={<RefreshCw size={15} aria-hidden="true" />}
              onClick={onOpenReschedule}
            />
          ) : null}
          <Button
            label="Agendar siguiente retoque (+21 días)"
            variant="secondary"
            size="md"
            className="fx-press"
            icon={<Sparkles size={15} aria-hidden="true" />}
            href={touchUpUrl}
          />
          <Button
            label="Ver mis citas"
            variant="ghost"
            size="md"
            className="fx-press"
            icon={<CalendarCheck size={15} aria-hidden="true" />}
            href="/mis-citas"
          />
          {!isCancelLocked ? (
            <Button
              type="button"
              label="Cancelar cita"
              variant="ghost"
              size="md"
              className="fx-press"
              icon={<XCircle size={15} aria-hidden="true" />}
              onClick={onOpenCancel}
            />
          ) : null}
        </HStack>
      </VStack>
    </SurfaceCard>
  );
}
