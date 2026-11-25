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
import { CalendarDays, ExternalLink, MessageCircle, Star, Wallet } from 'lucide-react';
import { useAdminData } from '@/components/admin/AdminProvider';
import {
  buildWhatsAppLink,
  formatCurrency,
  formatDateShortInTimezone,
  formatTimeInTimezone,
} from '@/lib/format';

export default function AdminOverviewPage() {
  const { data } = useAdminData();
  if (!data) return null;

  const { kpis, settings, bookings, waitlist, inventory } = data;
  const tz = settings.timezone || 'America/Mexico_City';

  const upcoming = bookings
    .filter((b) => ['confirmed', 'pending_confirmation', 'pending_payment'].includes(b.status))
    .slice(0, 6);

  const lowStock = inventory.filter((i) => i.isActive && i.stockQuantity <= i.minStockAlert);

  return (
    <VStack gap={5}>
      <HStack justify="between" align="center" wrap="wrap" gap={3}>
        <VStack gap={0.5}>
          <Heading level={1}>Hola, {data.session.user.fullName.split(' ')[0]}</Heading>
          <Text color="secondary">
            Resumen operativo de {settings.name} · Sincronizado en tiempo real.
          </Text>
        </VStack>
        <HStack gap={2}>
          <Button label="Ir a Citas" variant="primary" icon={<CalendarDays size={16} />} href="/admin/citas" />
          <Button label="Ver agenda pública" variant="secondary" icon={<ExternalLink size={16} />} href="/reservar" />
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
