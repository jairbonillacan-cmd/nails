'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { Token } from '@astryxdesign/core/Token';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Copy,
  CreditCard,
  ExternalLink,
  HeartHandshake,
  MessageCircle,
  Share2,
  Star,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import { useEphemeralMessage } from '@/lib/hooks/useEphemeralMessage';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';

export default function AdminOverviewPage() {
  const { data } = useAdminData();
  const shareFeedback = useEphemeralMessage(2500);

  if (!data) return null;

  const {
    kpis,
    settings,
    bookings,
    waitlist,
    inventory,
    onboardingChecklist,
    pendingDeposits,
    retention,
    staff,
  } = data;
  const tz = settings.timezone || 'America/Mexico_City';

  const upcoming = bookings
    .filter((b) => ['confirmed', 'pending_confirmation', 'pending_payment'].includes(b.status))
    .slice(0, 6);

  const lowStock = inventory.filter((i) => i.isActive && i.stockQuantity <= i.minStockAlert);
  const nextChecklistStep = onboardingChecklist.steps.find((step) => !step.done) ?? null;
  const checklistComplete = onboardingChecklist.completedCount >= onboardingChecklist.totalCount;

  const depositUnitCents = settings.depositAmountCents ?? 20000;
  const pendingDepositsTotalCents = pendingDeposits.reduce(
    (sum, dep) => sum + (dep.depositAmountCents || depositUnitCents),
    0,
  );
  const activeStaff = staff.filter((member) => member.isActive);

  const getPublicBookingUrl = () =>
    typeof window !== 'undefined' ? `${window.location.origin}/reservar` : '/reservar';

  const handleCopyBookingLink = async () => {
    try {
      await navigator.clipboard.writeText(getPublicBookingUrl());
      shareFeedback.show('¡Link de reservas copiado!');
    } catch {
      shareFeedback.show('Copia manualmente /reservar');
    }
  };

  const handleShareBookingLink = async () => {
    const url = getPublicBookingUrl();
    const shareText = `Reserva tu cita en ${settings.name} en segundos:`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: settings.name,
          text: shareText,
          url,
        });
        shareFeedback.show('Página compartida');
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${url}`);
      shareFeedback.show('¡Enlace listo para pegar en WhatsApp o IG!');
    } catch {
      shareFeedback.show('Abre /reservar para compartir');
    }
  };

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Hola, {data.session.user.fullName.split(' ')[0]}</Heading>
          <Text color="secondary">
            Resumen operativo de {settings.name} · Sincronizado en tiempo real.
          </Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <Button
            label="Ir a Citas"
            variant="primary"
            icon={<CalendarDays size={16} />}
            href="/admin/citas"
          />
          <Button
            label="Ver agenda pública"
            variant="secondary"
            icon={<ExternalLink size={16} />}
            href="/reservar"
          />
        </HStack>
      </HStack>

      {kpis.pendingConfirmationsCount > 0 ? (
        <Banner
          status="warning"
          title={`Tienes ${kpis.pendingConfirmationsCount} cita(s) esperando confirmación o validación de anticipo`}
          endContent={
            <Button label="Revisar ahora" variant="secondary" size="sm" href="/admin/citas" />
          }
        />
      ) : null}

      <Grid columns={{ minWidth: 320, max: 2 }} gap={4} align="start">
        <Card padding={5}>
          <VStack gap={3}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <VStack gap={0.5}>
                <Heading level={3}>
                  {checklistComplete
                    ? `Tu negocio está listo (${onboardingChecklist.completedCount}/${onboardingChecklist.totalCount} pasos)`
                    : `Tu negocio, casi listo (${onboardingChecklist.completedCount}/${onboardingChecklist.totalCount} pasos)`}
                </Heading>
                <Text type="supporting" color="secondary">
                  Completa estos pasos para aprovechar reservas 24/7, anticipos y recordatorios.
                </Text>
              </VStack>
              <Badge
                variant={checklistComplete ? 'success' : 'info'}
                label={`${onboardingChecklist.completedCount}/${onboardingChecklist.totalCount}`}
              />
            </HStack>

            <ProgressBar
              label="Progreso de configuración del negocio"
              value={onboardingChecklist.completedCount}
              max={onboardingChecklist.totalCount}
              hasValueLabel
              formatValueLabel={(val, max) => `${Math.round((val / Math.max(1, max)) * 100)}%`}
              variant={checklistComplete ? 'success' : 'accent'}
            />

            {nextChecklistStep ? (
              <Card variant="muted" padding={3}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <VStack gap={0.5}>
                    <Text type="label" weight="semibold">
                      SIGUIENTE PASO
                    </Text>
                    <Text weight="medium">{nextChecklistStep.label}</Text>
                  </VStack>
                  <Button
                    label="Completar"
                    variant="primary"
                    size="sm"
                    href={nextChecklistStep.href}
                    endContent={<ArrowRight size={14} />}
                  />
                </HStack>
              </Card>
            ) : (
              <Card variant="muted" padding={3}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <Text weight="medium">Todos los pasos iniciales están completos.</Text>
                  <Button
                    label="Abrir asistente"
                    variant="secondary"
                    size="sm"
                    href="/admin/onboarding"
                  />
                </HStack>
              </Card>
            )}

            <List hasDividers>
              {onboardingChecklist.steps.map((step) => (
                <ListItem
                  key={step.id}
                  label={step.label}
                  href={step.href}
                  startContent={
                    step.done ? (
                      <CheckCircle2 size={16} aria-hidden="true" />
                    ) : (
                      <Circle size={16} aria-hidden="true" />
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
          </VStack>
        </Card>

        <VStack gap={4}>
          <Card padding={5}>
            <VStack gap={3}>
              <HStack justify="between" align="center" wrap="wrap" gap={2}>
                <Heading level={3}>Tu página de reservas</Heading>
                <HStack gap={1.5} align="center">
                  <StatusDot variant="success" label="Página de reservas en vivo" isPulsing />
                  <Text type="label" weight="semibold">
                    En vivo
                  </Text>
                </HStack>
              </HStack>
              <Text type="supporting" color="secondary">
                Compártela en la bio de {settings.instagramHandle || 'Instagram'} y por WhatsApp
                para que tus clientas aparten sin esperar mensajes.
              </Text>
              <Card variant="muted" padding={3}>
                <HStack justify="between" align="center" wrap="wrap" gap={2}>
                  <Text weight="semibold">/reservar</Text>
                  <Token
                    size="sm"
                    label={
                      settings.instagramHandle
                        ? `${settings.name} · ${settings.instagramHandle}`
                        : settings.name
                    }
                  />
                </HStack>
              </Card>
              <HStack gap={2} wrap="wrap">
                <Button
                  type="button"
                  label={shareFeedback.message ?? 'Copiar link'}
                  variant="primary"
                  size="sm"
                  icon={<Copy size={14} />}
                  onClick={() => void handleCopyBookingLink()}
                />
                <Button
                  label="Abrir página"
                  variant="secondary"
                  size="sm"
                  icon={<ExternalLink size={14} />}
                  href="/reservar"
                  target="_blank"
                  rel="noopener noreferrer"
                />
                <Button
                  type="button"
                  label="Compartir"
                  variant="secondary"
                  size="sm"
                  icon={<Share2 size={14} />}
                  onClick={() => void handleShareBookingLink()}
                />
              </HStack>
            </VStack>
          </Card>

          <Grid columns={{ minWidth: 220, max: 3 }} gap={3}>
            <Card padding={4}>
              <VStack gap={2}>
                <HStack justify="between" align="center">
                  <Text type="label" color="secondary">
                    Anticipos pendientes ({formatCurrency(depositUnitCents, settings.currency)})
                  </Text>
                  <CreditCard size={16} aria-hidden="true" />
                </HStack>
                <Heading level={2}>{pendingDeposits.length}</Heading>
                <Text type="supporting" color="secondary">
                  {pendingDeposits.length > 0
                    ? `${formatCurrency(pendingDepositsTotalCents, settings.currency)} por validar`
                    : 'Sin comprobantes pendientes'}
                </Text>
                <Button
                  label="Revisar anticipos"
                  variant="secondary"
                  size="sm"
                  href="/admin/caja?tab=anticipos"
                />
              </VStack>
            </Card>

            <Card padding={4}>
              <VStack gap={2}>
                <HStack justify="between" align="center">
                  <Text type="label" color="secondary">
                    Retención
                  </Text>
                  <HeartHandshake size={16} aria-hidden="true" />
                </HStack>
                <Heading level={2}>{retention.returningClientsCount}</Heading>
                <Text type="supporting" color="secondary">
                  recurrentes · {retention.inactiveClients.length} inactivas (+30d)
                </Text>
                <Button
                  label="Ver clientas"
                  variant="secondary"
                  size="sm"
                  href="/admin/clientas"
                />
              </VStack>
            </Card>

            <Card padding={4}>
              <VStack gap={2}>
                <HStack justify="between" align="center">
                  <Text type="label" color="secondary">
                    Invita a tu equipo
                  </Text>
                  <UserPlus size={16} aria-hidden="true" />
                </HStack>
                <Heading level={2}>{activeStaff.length}</Heading>
                <Text type="supporting" color="secondary">
                  {activeStaff.map((member) => member.name).join(', ') || 'Sin especialistas'}
                </Text>
                <Button
                  label="Gestionar equipo"
                  variant="secondary"
                  size="sm"
                  href="/admin/equipo"
                />
              </VStack>
            </Card>
          </Grid>
        </VStack>
      </Grid>

      <Grid columns={{ minWidth: 200, max: 4 }} gap={4}>
        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label" color="secondary">
              Citas hoy
            </Text>
            <Heading level={2}>{kpis.todayBookingsCount}</Heading>
            <Text type="supporting" color="secondary">
              {kpis.pendingConfirmationsCount} por confirmar
            </Text>
          </VStack>
        </Card>

        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label" color="secondary">
              Caja neta registrada
            </Text>
            <Heading level={2}>{formatCurrency(kpis.netCashCents, settings.currency)}</Heading>
            <Text type="supporting" color="secondary">
              Propinas: {formatCurrency(kpis.totalTipsCents, settings.currency)}
            </Text>
          </VStack>
        </Card>

        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label" color="secondary">
              Satisfacción y reseñas
            </Text>
            <HStack gap={1.5} align="center">
              <Heading level={2}>{kpis.avgRating}</Heading>
              <Star size={18} aria-hidden="true" />
            </HStack>
            <Text type="supporting" color="secondary">
              {kpis.reviewsCount} encuestas · No-show: {kpis.noShowRatePercent}%
            </Text>
          </VStack>
        </Card>

        <Card padding={4}>
          <VStack gap={1}>
            <Text type="label" color="secondary">
              Alertas activas
            </Text>
            <Heading level={2}>{kpis.lowStockCount + kpis.waitlistCount}</Heading>
            <Text type="supporting" color="secondary">
              {kpis.waitlistCount} en lista de espera · {kpis.lowStockCount} stock bajo
            </Text>
          </VStack>
        </Card>
      </Grid>

      <Grid columns={{ minWidth: 320, max: 2 }} gap={5} align="start">
        <Card padding={5}>
          <VStack gap={3}>
            <HStack justify="between" align="center">
              <Heading level={3}>Próximas citas</Heading>
              <Button label="Ver todas" variant="ghost" size="sm" href="/admin/citas" />
            </HStack>
            <List hasDividers>
              {upcoming.map((b) => (
                <ListItem
                  key={b.id}
                  label={`${b.client.fullName} — ${b.service.name}`}
                  description={
                    <Text type="supporting" color="secondary">
                      {formatDateShortInTimezone(b.startAt, tz)} ·{' '}
                      {formatTimeInTimezone(b.startAt, tz)} · {b.staff.name}
                    </Text>
                  }
                  endContent={
                    <HStack gap={2} align="center">
                      <Token size="sm" label={b.source === 'whatsapp' ? 'WhatsApp' : 'Web'} />
                      <Badge
                        variant={b.status === 'confirmed' ? 'success' : 'warning'}
                        label={b.status === 'confirmed' ? 'Confirmada' : 'Por confirmar'}
                      />
                    </HStack>
                  }
                />
              ))}
            </List>
          </VStack>
        </Card>

        <VStack gap={4}>
          <Card padding={5}>
            <VStack gap={3}>
              <HStack justify="between" align="center">
                <Heading level={3}>Lista de espera</Heading>
                <Badge variant="info" label={String(kpis.waitlistCount)} />
              </HStack>
              {waitlist.filter((w) => w.status === 'waiting').length === 0 ? (
                <Text type="supporting" color="secondary">
                  Sin clientas esperando espacios por ahora.
                </Text>
              ) : (
                <List hasDividers>
                  {waitlist
                    .filter((w) => w.status === 'waiting')
                    .slice(0, 4)
                    .map((w) => {
                      const srv = data.services.find((s) => s.id === w.serviceId);
                      const waLink = buildWhatsAppLink(
                        w.clientPhoneE164,
                        `Hola ${w.clientName}, se liberó un espacio en ${settings.name} para ${srv?.name || 'tu cita'} el ${w.desiredDate}. ¿Te lo apartamos?`,
                      );
                      return (
                        <ListItem
                          key={w.id}
                          label={w.clientName}
                          description={
                            <Text type="supporting" color="secondary">
                              {srv?.name} · {w.desiredDate} ({w.preferredWindow})
                            </Text>
                          }
                          endContent={
                            <Button
                              label="Avisar WA"
                              variant="secondary"
                              size="sm"
                              icon={<MessageCircle size={14} />}
                              href={waLink}
                            />
                          }
                        />
                      );
                    })}
                </List>
              )}
            </VStack>
          </Card>

          <Card padding={5}>
            <VStack gap={3}>
              <HStack justify="between" align="center">
                <Heading level={3}>Alertas de inventario</Heading>
                <Button label="Ir a inventario" variant="ghost" size="sm" href="/admin/inventario" />
              </HStack>
              {lowStock.length === 0 ? (
                <Text type="supporting" color="secondary">
                  Todos los insumos están arriba del stock mínimo.
                </Text>
              ) : (
                <List hasDividers>
                  {lowStock.map((item) => (
                    <ListItem
                      key={item.id}
                      label={item.name}
                      description={
                        <Text type="supporting" color="secondary">
                          Mínimo: {item.minStockAlert} {item.unit}
                        </Text>
                      }
                      endContent={
                        <Badge
                          variant="error"
                          label={`${item.stockQuantity} ${item.unit}`}
                        />
                      }
                    />
                  ))}
                </List>
              )}
            </VStack>
          </Card>

          <Card variant="muted" padding={4}>
            <HStack justify="between" align="center" wrap="wrap" gap={2}>
              <HStack gap={2} align="center">
                <Wallet size={18} aria-hidden="true" />
                <Text weight="medium">Corte de caja y comisiones del equipo</Text>
              </HStack>
              <Button label="Abrir caja" variant="secondary" size="sm" href="/admin/caja" />
            </HStack>
          </Card>
        </VStack>
      </Grid>
    </VStack>
  );
}
