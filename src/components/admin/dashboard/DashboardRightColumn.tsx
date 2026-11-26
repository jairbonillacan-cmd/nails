'use client';

import { useRef } from 'react';
import NextLink from 'next/link';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { List, ListItem } from '@astryxdesign/core/List';
import { Badge } from '@astryxdesign/core/Badge';
import { CheckCircle2, Circle } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { roleCanAccess } from '@/lib/rbac';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import { LANDING_ASSETS } from '../../landing/landingContent';
import type { AdminOverviewPayload } from '../AdminProvider';
import { getDisplayBookingUrl, type DashboardMetrics } from './dashboardMetrics';

interface DashboardRightColumnProps {
  data: AdminOverviewPayload;
  metrics: DashboardMetrics;
}

export function DashboardRightColumn({ data, metrics }: DashboardRightColumnProps) {
  const shareFeedback = useEphemeralMessage(2400);
  const lastFeedbackRef = useRef('');
  const { settings, onboardingChecklist, nearRewardClients, retention } = data;
  const role = data.session.user.role;
  const currency = settings.currency;
  const bookingDisplayUrl = getDisplayBookingUrl(data.integration.appUrl);

  const checklistComplete =
    onboardingChecklist.completedCount >= onboardingChecklist.totalCount;
  const nextStep = onboardingChecklist.steps.find((step) => !step.done) ?? null;

  const announce = (raw: string) => {
    let message = raw;
    if (message === lastFeedbackRef.current) message += '\u00A0';
    lastFeedbackRef.current = message;
    shareFeedback.show(message);
  };

  const getPublicUrl = (suffix: '/reservar' | '/links') =>
    typeof window !== 'undefined'
      ? `${window.location.origin}${suffix}`
      : `${data.integration.appUrl.replace(/\/+$/, '')}${suffix}`;

  const handleCopyBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(getPublicUrl('/reservar'));
      announce('¡Link de reservas copiado!');
    } catch {
      announce('Copia manualmente /reservar');
    }
  };

  const handleShareBookingLink = async () => {
    const url = getPublicUrl('/reservar');
    const text = `Reserva tu cita en ${settings.name} en segundos:`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: settings.name, text, url });
        announce('Página compartida');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      announce('¡Enlace listo para WhatsApp o IG!');
    } catch {
      announce('Abre /reservar para compartir');
    }
  };

  const cashRows = [
    {
      label: 'Efectivo',
      value: formatCurrency(metrics.cash.cashIncomeCents, currency),
    },
    {
      label: 'Tarjeta y transferencia',
      value: formatCurrency(metrics.cash.digitalIncomeCents, currency),
    },
    {
      label: 'Comisiones del equipo',
      value:
        metrics.cash.commissionsCents > 0
          ? `−${formatCurrency(metrics.cash.commissionsCents, currency)}`
          : formatCurrency(0, currency),
    },
    {
      label: 'Propinas para el equipo',
      value: formatCurrency(metrics.cash.tipsCents, currency),
    },
  ];

  return (
    <VStack gap={5} className="ad-right-col">
      <VStack as="section" className="ad-cherry-card" aria-labelledby="ad-pg" gap={3}>
        <img
          src={LANDING_ASSETS.cherriesWhite}
          alt=""
          width={170}
          height={170}
          className="ad-cherry-art"
          aria-hidden="true"
        />

        <HStack gap={2} align="center" className="ad-cherry-layer">
          <Text className="ad-live-dot fx-pulse-dot" aria-hidden="true">
            {'\u200B'}
          </Text>
          <Text color="inherit" weight="bold" size="sm" className="ad-live-label">
            EN VIVO
          </Text>
        </HStack>

        <Heading level={2} id="ad-pg" className="lk-serif ad-cherry-title ad-cherry-layer">
          Tu página de reservas
        </Heading>

        <Text color="inherit" className="ad-cherry-desc ad-cherry-layer" textWrap="pretty">
          Ponla en la bio de {settings.instagramHandle || 'Instagram'} y mándala por WhatsApp. Tus
          clientas apartan solas, con anticipo.
        </Text>

        <HStack
          justify="between"
          align="center"
          gap={2}
          className="ad-cherry-link ad-cherry-layer"
        >
          <Text color="inherit" weight="semibold" size="sm" className="ad-link-url">
            {bookingDisplayUrl}
          </Text>
          <button
            type="button"
            className="ad-cherry-copy fx-press"
            onClick={() => void handleCopyBookingLink()}
          >
            {shareFeedback.message ? '¡Copiado!' : 'Copiar'}
          </button>
        </HStack>

        <Text
          type="supporting"
          color="inherit"
          role="status"
          aria-live="polite"
          className="rb-sr-only"
        >
          {shareFeedback.message ?? ''}
        </Text>

        <HStack gap={2} wrap="wrap" className="ad-cherry-layer">
          <NextLink
            href="/reservar"
            target="_blank"
            rel="noopener noreferrer"
            className="ad-cherry-chip fx-press"
          >
            Ver página
          </NextLink>
          <NextLink
            href="/links"
            target="_blank"
            rel="noopener noreferrer"
            className="ad-cherry-chip fx-press"
          >
            Bio-link /links
          </NextLink>
          {roleCanAccess(role, 'brand') ? (
            <NextLink href="/admin/marca" className="ad-cherry-chip fx-press">
              Código QR
            </NextLink>
          ) : null}
          <button
            type="button"
            className="ad-cherry-chip fx-press"
            onClick={() => void handleShareBookingLink()}
          >
            Compartir
          </button>
        </HStack>
      </VStack>

      {!checklistComplete && nextStep ? (
        <VStack as="section" className="ad-card ad-side-card" aria-labelledby="ad-setup" gap={3}>
          <HStack justify="between" align="center" gap={2}>
            <Heading level={2} id="ad-setup" className="lk-serif ad-h3">
              Configura tu estudio
            </Heading>
            <Text color="accent" weight="bold" size="sm" hasTabularNumbers>
              {onboardingChecklist.completedCount} de {onboardingChecklist.totalCount}
            </Text>
          </HStack>

          <ProgressBar
            label="Pasos completados"
            isLabelHidden
            value={onboardingChecklist.completedCount}
            max={onboardingChecklist.totalCount}
            variant="accent"
          />

          <HStack justify="between" align="center" gap={3} wrap="wrap">
            <Text size="sm" className="rb-grow">
              <Text color="secondary" size="sm">
                Falta:{' '}
              </Text>
              {nextStep.label}
            </Text>
            <Button label="Terminar →" variant="secondary" size="sm" href={nextStep.href} />
          </HStack>

          <Collapsible
            defaultIsOpen={false}
            trigger={
              <Text type="supporting" color="secondary" weight="semibold">
                Ver los {onboardingChecklist.totalCount} pasos
              </Text>
            }
          >
            <List hasDividers density="compact">
              {onboardingChecklist.steps.map((step) => (
                <ListItem
                  key={step.id}
                  label={step.label}
                  href={step.href}
                  startContent={
                    step.done ? (
                      <CheckCircle2 size={15} aria-hidden="true" />
                    ) : (
                      <Circle size={15} aria-hidden="true" />
                    )
                  }
                  endContent={
                    <Badge
                      variant={step.done ? 'success' : 'neutral'}
                      label={step.done ? 'Listo' : 'Pendiente'}
                    />
                  }
                />
              ))}
            </List>
          </Collapsible>
        </VStack>
      ) : null}

      {roleCanAccess(role, 'cash') ? (
        <VStack as="section" className="ad-card ad-side-card" aria-labelledby="ad-caja" gap={3}>
          <HStack justify="between" align="center" gap={2}>
            <Heading level={2} id="ad-caja" className="lk-serif ad-h3">
              Corte de hoy
            </Heading>
            <NextLink href="/admin/caja" className="ad-inline-link">
              Ir a Caja →
            </NextLink>
          </HStack>

          {!metrics.cash.hasTodayEntries && data.cashEntries.length > 0 ? (
            <Text type="supporting" color="secondary">
              Sin movimientos hoy · resumen registrado
            </Text>
          ) : null}

          <VStack gap={2}>
            {cashRows.map((row) => (
              <HStack key={row.label} justify="between" align="center" gap={2} className="ad-cash-row">
                <Text color="secondary" size="sm">
                  {row.label}
                </Text>
                <Text weight="semibold" size="sm" hasTabularNumbers>
                  {row.value}
                </Text>
              </HStack>
            ))}
          </VStack>
        </VStack>
      ) : null}

      <VStack as="section" className="ad-card ad-side-card" aria-labelledby="ad-loy" gap={3}>
        <HStack justify="between" align="center" gap={2}>
          <Heading level={2} id="ad-loy" className="lk-serif ad-h3">
            Cerca de su premio
          </Heading>
          <Text type="supporting" color="secondary" hasTabularNumbers>
            {retention.returningClientsCount} recurrentes
          </Text>
        </HStack>

        {nearRewardClients.length === 0 ? (
          <Text type="supporting" color="secondary">
            Cuando tus clientas acumulen sellos cerca del objetivo aparecerán aquí para recordarles
            su premio.
          </Text>
        ) : (
          <VStack gap={3}>
            {nearRewardClients.slice(0, 4).map((client) => {
              const required = Math.max(1, client.summary.stampsRequired);
              const totalSlots = Math.min(12, required);
              const filledSlots = Math.min(
                totalSlots,
                Math.round((client.summary.currentStamps / required) * totalSlots),
              );
              const progressLabel = `${client.summary.currentStamps} de ${required} · ${client.summary.rewardLabel}`;
              const content = (
                <VStack gap={1.5}>
                  <HStack justify="between" align="center" gap={2} wrap="wrap">
                    <Text weight="semibold" size="sm">
                      {client.fullName}
                    </Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {progressLabel}
                    </Text>
                  </HStack>
                  <ul className="ad-stamps" aria-hidden="true">
                    {Array.from({ length: totalSlots }, (_, idx) => (
                      <li
                        key={idx}
                        className="ad-stamp"
                        data-on={idx < filledSlots ? 'true' : 'false'}
                      />
                    ))}
                  </ul>
                </VStack>
              );

              if (roleCanAccess(role, 'clients')) {
                return (
                  <NextLink
                    key={client.clientId}
                    href={`/admin/clientas?q=${encodeURIComponent(client.phoneE164)}`}
                    className="ad-loyalty-link"
                  >
                    {content}
                  </NextLink>
                );
              }

              return (
                <VStack key={client.clientId} gap={0}>
                  {content}
                </VStack>
              );
            })}
          </VStack>
        )}

        <HStack justify="between" align="center" gap={2} wrap="wrap">
          {roleCanAccess(role, 'clients') ? (
            <NextLink href="/admin/clientas" className="ad-inline-link">
              Ver clientas →
            </NextLink>
          ) : null}
          {roleCanAccess(role, 'team') ? (
            <NextLink href="/admin/equipo" className="ad-inline-link-muted">
              Equipo ({metrics.activeStaff.length}) →
            </NextLink>
          ) : null}
        </HStack>
      </VStack>
    </VStack>
  );
}
