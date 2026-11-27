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
  Check,
  CheckCircle2,
  DollarSign,
  MessageCircle,
  Star,
  UserRound,
  UserX,
} from 'lucide-react';
import type { BookingStatus } from '@/lib/types';

interface BookingPopoverActionsProps {
  allowedNext: readonly BookingStatus[];
  isPending: boolean;
  isCompleted: boolean;
  isPastUnclosed?: boolean;
  canCollect: boolean;
  canRemind: boolean;
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
  onNoShowDirect?: () => void;
  onCheckout: () => void;
  onReschedule: () => void;
  onRemind: () => void;
  onRequestNoShow: () => void;
  onRequestCancel: () => void;
}

export function BookingPopoverActions({
  allowedNext,
  isPending,
  isCompleted,
  isPastUnclosed = false,
  canCollect,
  canRemind,
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

  return (
    <VStack gap={3}>
      <VStack gap={1.5} paddingBlockStart={1}>
        <HStack gap={2} wrap="wrap">
          {isPending && !isPastUnclosed ? (
            <Button
              type="button"
              label={busyStatus === 'confirmed' ? 'Confirmando…' : 'Confirmar'}
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
              label={busyStatus === 'confirmed' ? 'Confirmando…' : 'Confirmar'}
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
              variant={!isPending && !canCollect ? 'primary' : 'secondary'}
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
              variant={!isPending && !canCollect && !showReviewLink ? 'primary' : 'secondary'}
              size="md"
              icon={<MessageCircle size={15} aria-hidden="true" />}
              href={whatsappChatHref}
            />
          ) : (
            <Button
              label="WhatsApp"
              variant={!isPending && !canCollect && !showReviewLink ? 'primary' : 'secondary'}
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

      <Divider />

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
    </VStack>
  );
}
