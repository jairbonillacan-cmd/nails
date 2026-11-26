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
  UserRound,
  UserX,
} from 'lucide-react';
import type { BookingStatus } from '@/lib/types';

interface BookingPopoverActionsProps {
  allowedNext: readonly BookingStatus[];
  isPending: boolean;
  canCollect: boolean;
  canRemind: boolean;
  isFullyPaid: boolean;
  isBusy: boolean;
  busyStatus: BookingStatus | null;
  isReminding: boolean;
  isRequestingReschedule: boolean;
  waHref: string;
  clientProfileHref: string;
  onConfirm: () => void;
  onComplete: () => void;
  onCheckout: () => void;
  onReschedule: () => void;
  onRemind: () => void;
  onRequestNoShow: () => void;
  onRequestCancel: () => void;
}

export function BookingPopoverActions({
  allowedNext,
  isPending,
  canCollect,
  canRemind,
  isFullyPaid,
  isBusy,
  busyStatus,
  isReminding,
  isRequestingReschedule,
  waHref,
  clientProfileHref,
  onConfirm,
  onComplete,
  onCheckout,
  onReschedule,
  onRemind,
  onRequestNoShow,
  onRequestCancel,
}: BookingPopoverActionsProps) {
  return (
    <VStack gap={3}>
      <HStack gap={2} wrap="wrap" paddingBlockStart={1}>
        {isPending ? (
          <Button
            type="button"
            label={busyStatus === 'confirmed' ? 'Confirmando...' : 'Confirmar'}
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
            variant={isPending ? 'secondary' : 'primary'}
            size="md"
            icon={<DollarSign size={15} aria-hidden="true" />}
            isDisabled={isBusy}
            onClick={onCheckout}
          />
        ) : null}
        {!isPending && allowedNext.includes('completed') && isFullyPaid ? (
          <Button
            type="button"
            label={busyStatus === 'completed' ? 'Completando...' : 'Completar'}
            variant="secondary"
            size="md"
            icon={<CheckCircle2 size={15} aria-hidden="true" />}
            isLoading={busyStatus === 'completed'}
            isDisabled={isBusy}
            onClick={onComplete}
          />
        ) : null}
        <Button
          label="WhatsApp"
          variant={!isPending && !canCollect ? 'primary' : 'secondary'}
          size="md"
          icon={<MessageCircle size={15} aria-hidden="true" />}
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
        />
      </HStack>

      <Divider />

      <VStack gap={2}>
        <Text type="supporting" color="secondary" weight="medium">
          Otras acciones
        </Text>
        <HStack gap={1.5} wrap="wrap">
          {canRemind ? (
            <Button
              type="button"
              label={isRequestingReschedule ? 'Generando...' : 'Reagendar'}
              variant="secondary"
              size="sm"
              icon={<CalendarClock size={14} aria-hidden="true" />}
              isLoading={isRequestingReschedule}
              isDisabled={isBusy || isRequestingReschedule}
              onClick={onReschedule}
            />
          ) : null}
          <Button
            label="Ver clienta"
            variant="secondary"
            size="sm"
            icon={<UserRound size={14} aria-hidden="true" />}
            href={clientProfileHref}
          />
          {canRemind ? (
            <Button
              type="button"
              label={isReminding ? 'Enviando...' : 'Recordatorio'}
              variant="ghost"
              size="sm"
              icon={<Bell size={14} aria-hidden="true" />}
              isLoading={isReminding}
              isDisabled={isBusy || isReminding}
              onClick={onRemind}
            />
          ) : null}
          {allowedNext.includes('no_show') ? (
            <Button
              type="button"
              label={busyStatus === 'no_show' ? 'Marcando...' : 'No llegó'}
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
              label={busyStatus === 'canceled' ? 'Cancelando...' : 'Cancelar'}
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
