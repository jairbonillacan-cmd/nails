'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Banner } from '@astryxdesign/core/Banner';
import { Check, ExternalLink, MessageCircle, Phone, XCircle } from 'lucide-react';
import { hasBookingProofSubmitted } from '@/lib/booking/balance';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
  formatPhoneDisplay,
  formatTimeInTimezone,
} from '@/lib/format';
import { StatusTag } from './StatusTag';

export interface DepositProofReviewItem {
  bookingId: string;
  bookingCode: string;
  clientName: string;
  clientPhone?: string | null;
  clientInstagram?: string | null;
  serviceName?: string | null;
  staffName?: string | null;
  startAt?: string | null;
  depositAmountCents: number;
  proofDeliveryMethod?: 'web_upload' | 'web_link' | 'instagram_dm' | 'none' | null;
  paymentProofUrl: string | null;
}

interface DepositProofReviewDialogProps {
  deposit: DepositProofReviewItem | null;
  onClose: () => void;
  currency: 'MXN' | 'USD';
  timezone: string;
  canApprove?: boolean;
  isApproving?: boolean;
  isRejecting?: boolean;
  secondaryLink?: {
    label: string;
    href: string;
  };
  onApprove?: (deposit: DepositProofReviewItem) => Promise<boolean> | boolean;
  onReject?: (deposit: DepositProofReviewItem, reason?: string) => Promise<boolean> | boolean;
}

const QUICK_REJECTION_REASONS = [
  'No se distingue el monto o el folio',
  'Foto borrosa o recortada',
  'El monto no corresponde al anticipo',
] as const;

function isSafeProofHref(url: string | null): url is string {
  if (!url) return false;
  return url.startsWith('/api/media/') || url.startsWith('https://');
}

function isImageProofHref(
  url: string | null,
  method?: DepositProofReviewItem['proofDeliveryMethod'],
): url is string {
  if (!url) return false;
  if (method === 'web_link' || url.startsWith('https://')) return false;
  return url.startsWith('/api/media/');
}

function formatInstagramHandle(handle: string): string {
  const clean = handle.trim().replace(/^@+/, '');
  return clean ? `@${clean}` : '';
}

export function DepositProofReviewDialog({
  deposit,
  onClose,
  currency,
  timezone,
  canApprove = true,
  isApproving = false,
  isRejecting = false,
  secondaryLink,
  onApprove,
  onReject,
}: DepositProofReviewDialogProps) {
  const [rejectDraft, setRejectDraft] = useState<{
    bookingId: string;
    reason: string;
  } | null>(null);
  const [errorState, setErrorState] = useState<{
    bookingId: string;
    message: string;
  } | null>(null);
  const [localAction, setLocalAction] = useState<'approve' | 'reject' | null>(null);

  const effectiveApproving = isApproving || localAction === 'approve';
  const effectiveRejecting = isRejecting || localAction === 'reject';
  const isBusy = effectiveApproving || effectiveRejecting;

  const isRejectMode = Boolean(
    deposit && rejectDraft && rejectDraft.bookingId === deposit.bookingId,
  );
  const rejectReason = isRejectMode ? (rejectDraft?.reason ?? '') : '';
  const visibleError =
    deposit && errorState && errorState.bookingId === deposit.bookingId
      ? errorState.message
      : null;

  const proofUrl = deposit && isSafeProofHref(deposit.paymentProofUrl)
    ? deposit.paymentProofUrl
    : null;
  const hasImageProof = Boolean(
    deposit && isImageProofHref(deposit.paymentProofUrl, deposit.proofDeliveryMethod),
  );
  const hasProof = Boolean(
    deposit &&
      hasBookingProofSubmitted({
        paymentProofUrl: deposit.paymentProofUrl,
        proofDeliveryMethod: deposit.proofDeliveryMethod,
      }),
  );

  const handleClose = () => {
    if (isBusy) return;
    setErrorState(null);
    setRejectDraft(null);
    onClose();
  };

  const handleApproveClick = async () => {
    if (!deposit || !onApprove || isBusy) return;
    setErrorState(null);
    setLocalAction('approve');
    try {
      const ok = await onApprove(deposit);
      if (ok) {
        setRejectDraft(null);
        onClose();
        return;
      }
      setErrorState({
        bookingId: deposit.bookingId,
        message: 'No se pudo confirmar el anticipo. Intenta de nuevo.',
      });
    } catch {
      setErrorState({
        bookingId: deposit.bookingId,
        message: 'Error de conexión al confirmar el anticipo.',
      });
    } finally {
      setLocalAction(null);
    }
  };

  const handleConfirmRejectClick = async () => {
    if (!deposit || !onReject || isBusy) return;
    setErrorState(null);
    setLocalAction('reject');
    try {
      const cleanReason = rejectReason.trim() || undefined;
      const ok = await onReject(deposit, cleanReason);
      if (ok) {
        setRejectDraft(null);
        onClose();
        return;
      }
      setErrorState({
        bookingId: deposit.bookingId,
        message: 'No se pudo rechazar el comprobante. Intenta de nuevo.',
      });
    } catch {
      setErrorState({
        bookingId: deposit.bookingId,
        message: 'Error de conexión al rechazar el comprobante.',
      });
    } finally {
      setLocalAction(null);
    }
  };

  const phoneDigits = deposit?.clientPhone?.replace(/[^\d+]/g, '') ?? '';

  return (
    <Dialog
      isOpen={Boolean(deposit)}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
      purpose="info"
      width={540}
      maxHeight="min(90dvh, calc(100dvh - 2rem))"
      padding={5}
    >
      {deposit ? (
        <Layout
          header={
            <DialogHeader
              title="Comprobante de anticipo"
              subtitle={`${deposit.clientName} · ${deposit.bookingCode}`}
              hasDivider
              onOpenChange={(open) => {
                if (!open) handleClose();
              }}
            />
          }
          content={
            <LayoutContent>
              <VStack
                gap={4}
                className={isBusy ? 'fx-busy' : undefined}
                aria-busy={isBusy || undefined}
              >
                {visibleError ? (
                  <Banner
                    status="error"
                    role="alert"
                    title={visibleError}
                    isDismissable
                    onDismiss={() => setErrorState(null)}
                  />
                ) : null}

                <VStack gap={2} className="ad-proof-meta">
                  {deposit.serviceName || deposit.staffName ? (
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <Text type="supporting" color="secondary">
                        Servicio y profesional
                      </Text>
                      <Text weight="semibold" size="sm">
                        {[deposit.serviceName, deposit.staffName].filter(Boolean).join(' · ')}
                      </Text>
                    </HStack>
                  ) : null}
                  {deposit.startAt ? (
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <Text type="supporting" color="secondary">
                        Fecha y hora
                      </Text>
                      <Text weight="semibold" size="sm" hasTabularNumbers>
                        {formatDateShortInTimezone(deposit.startAt, timezone)} ·{' '}
                        {formatTimeInTimezone(deposit.startAt, timezone)}
                      </Text>
                    </HStack>
                  ) : null}
                  <HStack justify="between" align="center" gap={2} wrap="wrap">
                    <Text type="supporting" color="secondary">
                      Anticipo esperado
                    </Text>
                    <StatusTag
                      tone="info"
                      hasTabularNumbers
                      label={formatCurrency(deposit.depositAmountCents, currency)}
                    />
                  </HStack>
                  {deposit.clientPhone ? (
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {formatPhoneDisplay(deposit.clientPhone)}
                      </Text>
                      <HStack gap={1.5} wrap="wrap">
                        <Button
                          label="WhatsApp"
                          variant="secondary"
                          size="sm"
                          className="ad-caja-touch-btn"
                          icon={<MessageCircle size={14} aria-hidden="true" />}
                          href={buildWhatsAppLink(
                            deposit.clientPhone,
                            `Hola ${deposit.clientName}, revisamos el comprobante de tu anticipo para la cita ${deposit.bookingCode}. ¿Nos compartes una foto completa donde se vea el monto y el folio? Gracias.`,
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                        />
                        {phoneDigits ? (
                          <Button
                            label="Llamar"
                            variant="ghost"
                            size="sm"
                            className="ad-caja-touch-btn"
                            icon={<Phone size={14} aria-hidden="true" />}
                            href={`tel:${phoneDigits}`}
                          />
                        ) : null}
                      </HStack>
                    </HStack>
                  ) : null}
                </VStack>

                {isRejectMode ? (
                  <VStack gap={3} className="ad-proof-note">
                    <VStack gap={0.5}>
                      <Text weight="semibold" size="sm">
                        ¿Rechazar este comprobante?
                      </Text>
                      <Text type="supporting" color="secondary">
                        Avisaremos a {deposit.clientName} para que suba un nuevo recibo de la cita{' '}
                        {deposit.bookingCode}. Su horario seguirá apartado mientras tanto.
                      </Text>
                    </VStack>
                    <HStack gap={1.5} wrap="wrap" role="group" aria-label="Motivos frecuentes">
                      {QUICK_REJECTION_REASONS.map((preset) => (
                        <Button
                          key={preset}
                          type="button"
                          label={preset}
                          size="sm"
                          variant={rejectReason === preset ? 'primary' : 'secondary'}
                          aria-pressed={rejectReason === preset}
                          onClick={() =>
                            setRejectDraft({
                              bookingId: deposit.bookingId,
                              reason: rejectReason === preset ? '' : preset,
                            })
                          }
                        />
                      ))}
                    </HStack>
                    <TextInput
                      label="Motivo para la clienta (opcional)"
                      placeholder="Ej. No se ve el folio completo del SPEI"
                      value={rejectReason}
                      onChange={(value) =>
                        setRejectDraft({
                          bookingId: deposit.bookingId,
                          reason: value.slice(0, 300),
                        })
                      }
                      isOptional
                    />
                  </VStack>
                ) : null}

                {hasImageProof && proofUrl ? (
                  <VStack gap={2}>
                    <a
                      href={proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ad-proof-viewer"
                      aria-label="Abrir el comprobante completo en otra pestaña"
                    >
                      <img
                        src={proofUrl}
                        alt={`Comprobante de anticipo de ${deposit.clientName}`}
                        className="ad-proof-img ad-proof-img-full"
                      />
                    </a>
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <Text type="supporting" color="secondary">
                        Desliza para ver todo el recibo o tócalo para abrirlo completo.
                      </Text>
                      <Button
                        label="Abrir completo"
                        variant="ghost"
                        size="sm"
                        icon={<ExternalLink size={14} aria-hidden="true" />}
                        href={proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      />
                    </HStack>
                  </VStack>
                ) : proofUrl ? (
                  <VStack gap={2} className="ad-proof-note">
                    <Text weight="semibold" size="sm">
                      Enlace de comprobante externo
                    </Text>
                    <Text type="supporting" color="secondary">
                      Abre el recibo en otra pestaña para verificar el depósito antes de confirmar.
                    </Text>
                    <Button
                      label="Abrir enlace del recibo"
                      variant="secondary"
                      size="sm"
                      icon={<ExternalLink size={14} aria-hidden="true" />}
                      href={proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  </VStack>
                ) : deposit.proofDeliveryMethod === 'instagram_dm' ? (
                  <VStack gap={1.5} className="ad-proof-note">
                    <Text weight="semibold" size="sm">
                      Enviado por mensaje de Instagram
                    </Text>
                    <Text type="supporting" color="secondary">
                      Revisa los mensajes de{' '}
                      {deposit.clientInstagram
                        ? formatInstagramHandle(deposit.clientInstagram)
                        : deposit.clientName}{' '}
                      para confirmar la transferencia.
                    </Text>
                  </VStack>
                ) : hasProof ? (
                  <VStack gap={1.5} className="ad-proof-note">
                    <Text weight="semibold" size="sm">
                      Comprobante registrado
                    </Text>
                    <Text type="supporting" color="secondary">
                      La clienta registró su comprobante, pero este archivo no tiene vista previa directa. Verifica el movimiento en tu banca o escríbele por WhatsApp antes de confirmar.
                    </Text>
                  </VStack>
                ) : (
                  <VStack gap={1.5} className="ad-proof-note">
                    <Text weight="semibold" size="sm">
                      Sin comprobante todavía
                    </Text>
                    <Text type="supporting" color="secondary">
                      La clienta aún no sube foto ni enlace de su transferencia.
                    </Text>
                  </VStack>
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter hasDivider>
              <HStack justify="between" align="center" gap={2} wrap="wrap" width="100%">
                {secondaryLink && !isRejectMode ? (
                  <Button
                    label={secondaryLink.label}
                    variant="ghost"
                    size="sm"
                    isDisabled={isBusy}
                    href={secondaryLink.href}
                  />
                ) : (
                  <HStack gap={0} />
                )}

                <HStack justify="end" gap={2} wrap="wrap">
                  {isRejectMode ? (
                    <>
                      <Button
                        type="button"
                        label="Volver"
                        variant="secondary"
                        size="sm"
                        isDisabled={isBusy}
                        onClick={() => {
                          setErrorState(null);
                          setRejectDraft(null);
                        }}
                      />
                      <Button
                        type="button"
                        label={effectiveRejecting ? 'Rechazando…' : 'Sí, rechazar'}
                        variant="destructive"
                        size="sm"
                        icon={<XCircle size={14} aria-hidden="true" />}
                        isLoading={effectiveRejecting}
                        isDisabled={isBusy}
                        onClick={() => void handleConfirmRejectClick()}
                      />
                    </>
                  ) : (
                    <>
                      {canApprove && hasProof && onReject ? (
                        <Button
                          type="button"
                          label="Rechazar"
                          variant="ghost"
                          size="sm"
                          icon={<XCircle size={14} aria-hidden="true" />}
                          isDisabled={isBusy}
                          onClick={() => {
                            setErrorState(null);
                            setRejectDraft({ bookingId: deposit.bookingId, reason: '' });
                          }}
                        />
                      ) : null}
                      <Button
                        type="button"
                        label="Cerrar"
                        variant="secondary"
                        size="sm"
                        isDisabled={isBusy}
                        onClick={handleClose}
                      />
                      {canApprove && onApprove ? (
                        <Button
                          type="button"
                          label={effectiveApproving ? 'Confirmando…' : 'Confirmar anticipo'}
                          variant="primary"
                          size="sm"
                          icon={<Check size={14} aria-hidden="true" />}
                          isLoading={effectiveApproving}
                          isDisabled={isBusy}
                          onClick={() => void handleApproveClick()}
                        />
                      ) : null}
                    </>
                  )}
                </HStack>
              </HStack>
            </LayoutFooter>
          }
        />
      ) : null}
    </Dialog>
  );
}
