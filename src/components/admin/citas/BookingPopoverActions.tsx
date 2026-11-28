'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import {
  Ban,
  Bell,
  CalendarClock,
  CalendarPlus,
  Check,
  CheckCircle2,
  DollarSign,
  MessageCircle,
  Star,
  UserCheck,
  UserRound,
  UserX,
} from 'lucide-react';
import type { BookingStatus } from '@/lib/types';

interface BookingPopoverActionsProps {
  section?: 'primary' | 'secondary' | 'all';
  allowedNext: readonly BookingStatus[];
  isPending: boolean;
  isCompleted: boolean;
  isPastUnclosed?: boolean;
  isFullyPaid?: boolean;
  canCollect: boolean;
  canRemind: boolean;
  canCheckIn?: boolean;
  isCheckingIn?: boolean;
  touchUpDays?: number;
  isBusy: boolean;
  busyStatus: BookingStatus | null;
  isReminding: boolean;
  isRequestingReschedule: boolean;
  canViewClients?: boolean;
  canManageIntegrations?: boolean;
  whatsappChatHref?: string | null;
  waHref: string;
  reviewWaHref: string | null;
  reviewSettingsHref: string;
  clientProfileHref: string;
  onConfirm: () => void;
  onComplete: () => void;
  onCheckIn?: () => void;
  onScheduleRetouch?: () => void;
  onNoShowDirect?: () => void;
  onCheckout: () => void;
  onReschedule: () => void;
  onRemind: () => void;
  onRequestNoShow: () => void;
  onRequestCancel: () => void;
}

export function BookingPopoverActions({
  section = 'all',
  allowedNext,
  isPending,
  isCompleted,
  isPastUnclosed = false,
  isFullyPaid = false,
  canCollect,
  canRemind,
  canCheckIn = false,
  isCheckingIn = false,
  touchUpDays = 21,
  isBusy,
  busyStatus,
  isReminding,
  isRequestingReschedule,
  canViewClients = true,
  canManageIntegrations = false,
  whatsappChatHref = null,
  waHref,
  reviewWaHref,
  reviewSettingsHref,
  clientProfileHref,
  onConfirm,
  onComplete,
  onCheckIn,
  onScheduleRetouch,
  onNoShowDirect,
  onCheckout,
  onReschedule,
  onRemind,
  onRequestNoShow,
  onRequestCancel,
}: BookingPopoverActionsProps) {
  const showReviewLink = isCompleted && Boolean(reviewWaHref);
  const showReviewSetupLink = isCompleted && !reviewWaHref && canManageIntegrations;
  const canMarkCompleted = !isPending && allowedNext.includes('completed');
  const showPrimaryNoShow = isPastUnclosed && allowedNext.includes('no_show');
  const showRetouch = isCompleted && Boolean(onScheduleRetouch);
  const retouchIsPrimary = showRetouch && isFullyPaid;

  const showPrimary = section === 'all' || section === 'primary';
  const showSecondary = section === 'all' || section === 'secondary';

  const primaryBlock = showPrimary ? (
    <VStack gap={1.5}>
      <HStack gap={2} wrap="wrap">
        {isPending && !isPastUnclosed ? (
          <Button
            type="button"
            label={busyStatus === 'confirmed' ? 'Confirmando…' : 'Confirmar anticipo'}
            variant="primary"
            size="md"
            icon={<Check size={15} aria-hidden="true" />}
            isLoading={busyStatus === 'confirmed'}
            isDisabled={isBusy}
            onClick={onConfirm}
          />
        ) : null}
        {canCollect ? (
          <Button
            type="button"
            label="Cobrar"
            variant={isPending && !isPastUnclosed ? 'secondary' : 'primary'}
            size="md"
            icon={<DollarSign size={15} aria-hidden="true" />}
            isDisabled={isBusy}
            onClick={onCheckout}
          />
        ) : null}
        {showRetouch && onScheduleRetouch ? (
          <Button
            type="button"
            label={`Agendar retoque (+${touchUpDays}d)`}
            variant={retouchIsPrimary ? 'primary' : 'secondary'}
            size="md"
            icon={<CalendarPlus size={15} aria-hidden="true" />}
            isDisabled={isBusy}
            onClick={onScheduleRetouch}
          />
        ) : null}
        {canCheckIn && onCheckIn && !isPastUnclosed ? (
          <Button
            type="button"
            label={isCheckingIn ? 'Registrando…' : 'Marcar llegada'}
            variant="secondary"
            size="md"
            icon={<UserCheck size={15} aria-hidden="true" />}
            isLoading={isCheckingIn}
            isDisabled={isBusy || isCheckingIn}
            onClick={onCheckIn}
          />
        ) : null}
        {canMarkCompleted ? (
          <Button
            type="button"
            label={busyStatus === 'completed' ? 'Guardando…' : 'Terminada'}
            variant="secondary"
            size="md"
            icon={<CheckCircle2 size={15} aria-hidden="true" />}
            isLoading={busyStatus === 'completed'}
            isDisabled={isBusy}
            onClick={onComplete}
          />
        ) : null}
        {showPrimaryNoShow ? (
          <Button
            type="button"
            label={busyStatus === 'no_show' ? 'Marcando…' : 'No llegó'}
            variant="secondary"
            size="md"
            icon={<UserX size={15} aria-hidden="true" />}
            isLoading={busyStatus === 'no_show'}
            isDisabled={isBusy}
            onClick={onNoShowDirect ?? onRequestNoShow}
          />
        ) : null}
        {isPending && isPastUnclosed ? (
          <Button
            type="button"
            label={busyStatus === 'confirmed' ? 'Confirmando…' : 'Confirmar anticipo'}
            variant="secondary"
            size="md"
            icon={<Check size={15} aria-hidden="true" />}
            isLoading={busyStatus === 'confirmed'}
            isDisabled={isBusy}
            onClick={onConfirm}
          />
        ) : null}
        {showReviewLink && reviewWaHref ? (
          <Button
            label="Pedir reseña"
            variant={!isPending && !canCollect && !retouchIsPrimary ? 'primary' : 'secondary'}
            size="md"
            icon={<Star size={15} aria-hidden="true" />}
            href={reviewWaHref}
            target="_blank"
            rel="noopener noreferrer"
          />
        ) : showReviewSetupLink ? (
          <Button
            label="Pedir reseña"
            variant="secondary"
            size="md"
            icon={<Star size={15} aria-hidden="true" />}
            href={reviewSettingsHref}
          />
        ) : null}
        {whatsappChatHref ? (
          <Button
            label="Abrir chat"
            variant={
              !isPending && !canCollect && !showReviewLink && !retouchIsPrimary
                ? 'primary'
                : 'secondary'
            }
            size="md"
            icon={<MessageCircle size={15} aria-hidden="true" />}
            href={whatsappChatHref}
          />
        ) : (
          <Button
            label="WhatsApp"
            variant={
              !isPending && !canCollect && !showReviewLink && !retouchIsPrimary
                ? 'primary'
                : 'secondary'
            }
            size="md"
            icon={<MessageCircle size={15} aria-hidden="true" />}
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
          />
        )}
      </HStack>
      {isCompleted && !reviewWaHref ? (
        <Text type="supporting" color="secondary">
          {canManageIntegrations
            ? 'Agrega tu enlace para reseñas en Google en Conexiones para enviar la invitación por WhatsApp desde aquí.'
            : 'Pide a la dueña agregar el enlace para reseñas en Google en Conexiones para enviarlo por WhatsApp desde aquí.'}
        </Text>
      ) : null}
    </VStack>
  ) : null;

  const secondaryBlock = showSecondary ? (
    <VStack gap={2}>
      <Text type="supporting" color="secondary" weight="medium">
        Otras acciones
      </Text>
      <HStack gap={1.5} wrap="wrap">
        {canRemind ? (
          <Button
            type="button"
            label={isRequestingReschedule ? 'Generando…' : 'Reagendar'}
            variant="secondary"
            size="sm"
            icon={<CalendarClock size={14} aria-hidden="true" />}
            isLoading={isRequestingReschedule}
            isDisabled={isBusy || isRequestingReschedule}
            onClick={onReschedule}
          />
        ) : null}
        {canViewClients ? (
          <Button
            label="Ver clienta"
            variant="secondary"
            size="sm"
            icon={<UserRound size={14} aria-hidden="true" />}
            href={clientProfileHref}
          />
        ) : null}
        {canRemind ? (
          <Button
            type="button"
            label={isReminding ? 'Enviando…' : 'Recordatorio'}
            variant="ghost"
            size="sm"
            icon={<Bell size={14} aria-hidden="true" />}
            isLoading={isReminding}
            isDisabled={isBusy || isReminding}
            onClick={onRemind}
          />
        ) : null}
        {allowedNext.includes('no_show') && !showPrimaryNoShow ? (
          <Button
            type="button"
            label={busyStatus === 'no_show' ? 'Marcando…' : 'No llegó'}
            variant="ghost"
            size="sm"
            icon={<UserX size={14} aria-hidden="true" />}
            isLoading={busyStatus === 'no_show'}
            isDisabled={isBusy}
            onClick={onRequestNoShow}
          />
        ) : null}
        {allowedNext.includes('canceled') ? (
          <Button
            type="button"
            label={busyStatus === 'canceled' ? 'Cancelando…' : 'Cancelar'}
            variant="ghost"
            size="sm"
            icon={<Ban size={14} aria-hidden="true" />}
            isLoading={busyStatus === 'canceled'}
            isDisabled={isBusy}
            onClick={onRequestCancel}
          />
        ) : null}
      </HStack>
    </VStack>
  ) : null;

  if (section === 'primary') {
    return primaryBlock;
  }
  if (section === 'secondary') {
    return (
      <VStack gap={2} className="ad-pop-actions">
        {secondaryBlock}
      </VStack>
    );
  }

  return (
    <VStack gap={3} className="ad-pop-actions">
      {primaryBlock}
      <Divider />
      {secondaryBlock}
    </VStack>
  );
}
