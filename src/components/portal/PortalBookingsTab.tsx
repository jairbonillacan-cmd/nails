'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { EmptyStateCard } from '@/components/ui/EmptyStateCard';
import { BookingStatusTag } from '@/components/ui/StatusTag';
import { SurfaceCard } from '@/components/ui/SurfaceCard';
import {
  formatCurrency,
  formatDateLongInTimezone,
  formatDateShortInTimezone,
  formatDuration,
  formatTimeInTimezone,
} from '@/lib/format';
import type { ClientPortalBookingDTO } from '@/lib/public-dto';

interface PortalBookingsTabProps {
  mode: 'upcoming' | 'history';
  bookings: ClientPortalBookingDTO[];
  timezone: string;
  currency: 'MXN' | 'USD';
}

export function PortalBookingsTab({
  mode,
  bookings,
  timezone,
  currency,
}: PortalBookingsTabProps) {
  const isUpcoming = mode === 'upcoming';

  return (
    <VStack role="tabpanel" aria-label={isUpcoming ? 'Próximas citas' : 'Historial de citas'}>
      <SurfaceCard
        headingLevel={3}
        title={isUpcoming ? 'Tus próximas citas' : 'Historial de visitas'}
        count={bookings.length}
        padded
        className="pt-card fx-fade-up"
      >
        {bookings.length === 0 ? (
          <EmptyStateCard
            title={isUpcoming ? 'Sin citas próximas' : 'Sin visitas anteriores'}
            description={
              isUpcoming
                ? 'Aún no tienes citas próximas agendadas con este número.'
                : 'Todavía no hay visitas anteriores registradas con este número.'
            }
            framed={false}
            isCompact={!isUpcoming}
            actions={
              isUpcoming ? (
                <Button
                  label="Agendar mi próxima cita"
                  variant="primary"
                  size="md"
                  className="fx-press"
                  icon={<BrandIcon name="servicio" size={1.25} />}
                  href="/reservar"
                />
              ) : undefined
            }
          />
        ) : (
          <VStack gap={3} className="fx-stagger">
            {bookings.map((item) => (
              <HStack key={item.id} className="pt-booking-row">
                <VStack gap={1} className="rb-grow">
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text weight="bold">{item.serviceName}</Text>
                    <BookingStatusTag status={item.status} size="sm" />
                    <Text type="code" color="secondary" hasTabularNumbers>
                      {item.bookingCode}
                    </Text>
                  </HStack>
                  {isUpcoming ? (
                    <>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {formatDateLongInTimezone(item.startAt, timezone)} ·{' '}
                        {formatTimeInTimezone(item.startAt, timezone)} · con {item.staffName}
                      </Text>
                      <Text type="supporting" color="secondary" hasTabularNumbers>
                        {formatDuration(item.totalDurationMinutes)} ·{' '}
                        {formatCurrency(item.totalPriceCents, currency)}
                      </Text>
                    </>
                  ) : (
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatDateShortInTimezone(item.startAt, timezone)} ·{' '}
                      {formatTimeInTimezone(item.startAt, timezone)} · con {item.staffName} ·{' '}
                      {formatCurrency(item.totalPriceCents, currency)}
                    </Text>
                  )}
                </VStack>
                <HStack gap={2} wrap="wrap">
                  {isUpcoming ? (
                    <>
                      <Button
                        label="Ver mi cita"
                        variant="primary"
                        size="md"
                        className="fx-press"
                        icon={<ArrowRight size={14} aria-hidden="true" />}
                        href={item.manageUrl}
                      />
                      <Button
                        label="Reagendar"
                        variant="secondary"
                        size="md"
                        className="fx-press"
                        icon={<RefreshCw size={14} aria-hidden="true" />}
                        href={`${item.manageUrl}?action=reschedule`}
                      />
                    </>
                  ) : (
                    <>
                      <Button
                        label="Volver a agendar"
                        variant="primary"
                        size="md"
                        className="fx-press"
                        icon={<BrandIcon name="servicio" size={1.125} />}
                        href={item.touchUpUrl}
                      />
                      <Button
                        label="Detalle"
                        variant="secondary"
                        size="md"
                        className="fx-press"
                        href={item.manageUrl}
                      />
                    </>
                  )}
                </HStack>
              </HStack>
            ))}
          </VStack>
        )}
      </SurfaceCard>
    </VStack>
  );
}
