'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
  ArrowLeft,
  Bell,
  CalendarPlus,
  CheckCircle2,
  LayoutDashboard,
  Volume2,
} from 'lucide-react';
import {
  ActionRow,
  CopyableField,
  StatusTag,
  SurfaceCard,
} from '@/components/ui';
import { formatCurrency, formatDuration } from '@/lib/format';

interface OnboardingStepAlertsProps {
  displaySalonName: string;
  address: string;
  bookingUrl: string;
  depositEnabled: boolean;
  depositAmountMxn: number;
  depositBank: string;
  currency: 'MXN' | 'USD';
  serviceName: string;
  serviceDurationMinutes: number;
  soundAlertsEnabled: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  notifDialogOpen: boolean;
  saving: boolean;
  onSetNotifDialogOpen: (open: boolean) => void;
  onTestChime: () => void;
  onActivateNotifications: () => void;
  onBackToSteps: () => void;
}

export function OnboardingStepAlerts({
  displaySalonName,
  address,
  bookingUrl,
  depositEnabled,
  depositAmountMxn,
  depositBank,
  currency,
  serviceName,
  serviceDurationMinutes,
  soundAlertsEnabled,
  notificationPermission,
  notifDialogOpen,
  saving,
  onSetNotifDialogOpen,
  onTestChime,
  onActivateNotifications,
  onBackToSteps,
}: OnboardingStepAlertsProps) {
  return (
    <>
      <SurfaceCard padded>
        <VStack key="wizard-step-live" gap={5} className="fx-step-in">
          <VStack gap={2}>
            <HStack gap={2} align="center">
              <StatusDot variant="success" label="Lista para compartir" isPulsing />
              <StatusTag tone="success" label="¡Todo listo!" className="fx-pop" />
            </HStack>
            <Heading level={2} className="lk-serif ad-h2">
              ¡{displaySalonName} está lista para recibir citas!
            </Heading>
            <Text color="secondary">
              Ya puedes pegar tu enlace en Instagram, enviarlo por WhatsApp o imprimir tu QR para el mostrador.
            </Text>
          </VStack>

          <CopyableField
            label="Tu enlace de citas (para tu bio de Instagram o WhatsApp)"
            value={bookingUrl}
            copyLabel="Copiar enlace"
            copiedLabel="Enlace copiado"
            feedbackMessage="Enlace de citas copiado"
            monospace
            endExtra={
              <Button
                label="Abrir mi agenda"
                variant="secondary"
                size="md"
                href="/reservar"
              />
            }
          />

          <SurfaceCard>
            <VStack as="ul" className="ad-row-list" gap={0}>
              <li>
                <ActionRow
                  leading={<CheckCircle2 size={18} aria-hidden="true" />}
                  title="Salón configurado"
                  subtitle={`${displaySalonName} · ${address || 'Puebla, México'}`}
                  status={<StatusTag tone="success" label="Listo" />}
                />
              </li>
              <li>
                <ActionRow
                  leading={<CheckCircle2 size={18} aria-hidden="true" />}
                  title="Anticipo"
                  meta={
                    depositEnabled
                      ? `${formatCurrency(Math.round(depositAmountMxn * 100), currency)} · ${depositBank || 'Transferencia'}`
                      : 'Sin anticipo obligatorio'
                  }
                  status={<StatusTag tone="success" label="Listo" />}
                />
              </li>
              <li>
                <ActionRow
                  leading={<CheckCircle2 size={18} aria-hidden="true" />}
                  title="Turnos y servicio estrella"
                  subtitle={`${serviceName.trim() || 'Rubber'} · ${formatDuration(serviceDurationMinutes)}`}
                  status={<StatusTag tone="success" label="Listo" />}
                />
              </li>
            </VStack>
          </SurfaceCard>

          <HStack
            className="ad-subpanel"
            justify="between"
            align="center"
            wrap="wrap"
            gap={3}
          >
            <HStack gap={2} align="center" className="rb-grow">
              <Bell size={18} aria-hidden="true" />
              <VStack gap={0.5} className="rb-grow">
                <Text weight="semibold" size="sm">
                  Sonido de nuevas citas
                </Text>
                <Text type="supporting" color="secondary">
                  {soundAlertsEnabled
                    ? 'Te avisará con un sonido suave cuando llegue una reserva.'
                    : 'Sonido en silencio por ahora.'}{' '}
                  Notificaciones:{' '}
                  {notificationPermission === 'granted'
                    ? 'activas'
                    : notificationPermission === 'denied'
                      ? 'bloqueadas'
                      : notificationPermission === 'unsupported'
                        ? 'no disponibles en este navegador'
                        : 'pendientes'}
                  .
                </Text>
              </VStack>
            </HStack>
            <HStack gap={2} wrap="wrap">
              <Button
                type="button"
                label="Probar sonido"
                variant="secondary"
                size="sm"
                icon={<Volume2 size={15} aria-hidden="true" />}
                onClick={onTestChime}
              />
              <Button
                type="button"
                label="Activar avisos"
                variant="secondary"
                size="sm"
                icon={<Bell size={15} aria-hidden="true" />}
                onClick={() => onSetNotifDialogOpen(true)}
              />
            </HStack>
          </HStack>

          <Divider />

          <HStack justify="between" align="center" wrap="wrap" gap={3}>
            <Button
              type="button"
              label="Editar pasos anteriores"
              variant="ghost"
              icon={<ArrowLeft size={15} aria-hidden="true" />}
              onClick={onBackToSteps}
            />
            <HStack gap={2} wrap="wrap">
              <Button
                label="Ir al inicio"
                variant="secondary"
                href="/admin"
                icon={<LayoutDashboard size={16} aria-hidden="true" />}
              />
              <Button
                label="Agendar primera cita"
                variant="primary"
                href="/admin/citas?new=1"
                icon={<CalendarPlus size={16} aria-hidden="true" />}
              />
            </HStack>
          </HStack>
        </VStack>
      </SurfaceCard>

      <Dialog
        isOpen={notifDialogOpen}
        onOpenChange={onSetNotifDialogOpen}
        width={480}
        padding={5}
        purpose="info"
      >
        <VStack gap={4}>
          <DialogHeader
            title="Entérate cuando alguien agende"
            subtitle="Recibe avisos suaves mientras trabajas en mesa"
            onOpenChange={onSetNotifDialogOpen}
          />
          <List hasDividers>
            <ListItem
              label="Nuevas citas y cambios"
              description={
                <Text type="supporting" color="secondary">
                  Aviso inmediato cuando una clienta reserva, cambia de hora o cancela.
                </Text>
              }
              startContent={<CalendarPlus size={17} aria-hidden="true" />}
            />
            <ListItem
              label="Anticipos listos para revisar"
              description={
                <Text type="supporting" color="secondary">
                  Te avisamos cuando una clienta sube su comprobante.
                </Text>
              }
              startContent={<Bell size={17} aria-hidden="true" />}
            />
            <ListItem
              label="Timbre suave de nueva cita"
              description={
                <Text type="supporting" color="secondary">
                  Puedes silenciarlo cuando quieras desde el menú del salón.
                </Text>
              }
              startContent={<Volume2 size={17} aria-hidden="true" />}
            />
          </List>
          <HStack justify="end" gap={2} wrap="wrap">
            <Button
              type="button"
              label="Ahora no"
              variant="secondary"
              onClick={() => onSetNotifDialogOpen(false)}
            />
            <Button
              type="button"
              label="Activar avisos"
              variant="primary"
              icon={<Bell size={15} aria-hidden="true" />}
              isLoading={saving}
              onClick={onActivateNotifications}
            />
          </HStack>
        </VStack>
      </Dialog>
    </>
  );
}
