'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Divider } from '@astryxdesign/core/Divider';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Globe, Timer } from 'lucide-react';
import type { AvailableSlot } from '@/lib/availability/engine';
import {
  formatCurrency,
  formatDateLongInTimezone,
  formatDuration,
} from '@/lib/format';
import type { PublicServiceDTO, PublicSettingsDTO } from '@/lib/public-dto';
import type { ServiceAddon } from '@/lib/types';
import type { AppliedCouponState } from './bookingApi';
import { formatServicePrice } from './bookingHelpers';

interface BookingSummaryCardProps {
  settings: PublicSettingsDTO;
  selectedService: PublicServiceDTO | undefined;
  selectedExtraServices: PublicServiceDTO[];
  activeSelectedAddons: ServiceAddon[];
  selectedSlot: AvailableSlot | null;
  timeFormat: '12h' | '24h';
  totalDurationMinutes: number;
  subtotalCents: number;
  totalPriceCents: number;
  hasStartingPrice: boolean;
  holdRemainingSec: number;
  couponInput: string;
  appliedCoupon: AppliedCouponState | null;
  couponError: string | null;
  onChangeCouponInput: (value: string) => void;
  onApplyCoupon: () => void;
}

export function BookingSummaryCard({
  settings,
  selectedService,
  selectedExtraServices,
  activeSelectedAddons,
  selectedSlot,
  timeFormat,
  totalDurationMinutes,
  subtotalCents,
  totalPriceCents,
  hasStartingPrice,
  holdRemainingSec,
  couponInput,
  appliedCoupon,
  couponError,
  onChangeCouponInput,
  onApplyCoupon,
}: BookingSummaryCardProps) {
  const timezone = settings.timezone || 'America/Mexico_City';

  return (
    <Card variant="muted" padding={5}>
      <VStack gap={4}>
        {holdRemainingSec > 0 ? (
          <VStack gap={1.5}>
            <HStack justify="between" align="center">
              <HStack gap={1.5} align="center">
                <Timer size={16} aria-hidden="true" />
                <Text weight="semibold">Horario apartado para ti</Text>
              </HStack>
              <HStack style={{ fontVariantNumeric: 'tabular-nums' }}>
                <Badge
                  variant="info"
                  label={`${Math.floor(holdRemainingSec / 60)}:${String(
                    holdRemainingSec % 60,
                  ).padStart(2, '0')}`}
                />
              </HStack>
            </HStack>
            <ProgressBar
              label="Tiempo restante de apartado"
              value={holdRemainingSec}
              max={(settings.slotHoldMinutes || 3) * 60}
              variant="accent"
            />
            <Text type="supporting" color="secondary">
              Nadie más puede tomar este espacio mientras completas tus datos.
            </Text>
          </VStack>
        ) : null}

        <Divider />

        <VStack gap={2}>
          <Heading level={3}>{selectedService?.name}</Heading>
          {selectedSlot ? (
            <VStack gap={1}>
              <Text weight="medium">
                {formatDateLongInTimezone(selectedSlot.startAt, timezone)}
              </Text>
              <Text color="accent" weight="semibold" hasTabularNumbers>
                {timeFormat === '24h'
                  ? selectedSlot.localTime24
                  : selectedSlot.localTime12}{' '}
                · Aprox. {formatDuration(totalDurationMinutes)}
              </Text>
              <Text type="supporting" color="secondary">
                Especialista: {selectedSlot.staffName}
              </Text>
              <HStack gap={1.5} align="center">
                <Globe size={14} aria-hidden="true" />
                <Text type="supporting" color="secondary">
                  Hora local del salón · Puebla ({timezone})
                </Text>
              </HStack>
            </VStack>
          ) : null}
        </VStack>

        {selectedExtraServices.length > 0 ? (
          <VStack gap={1}>
            <Text type="label" weight="semibold">
              Servicios adicionales
            </Text>
            {selectedExtraServices.map((srv) => (
              <HStack
                key={srv.id}
                justify="between"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                <Text type="supporting">{srv.name}</Text>
                <Text type="supporting" hasTabularNumbers>
                  {formatServicePrice(srv.priceCents, srv.isStartingPrice, settings.currency)}
                </Text>
              </HStack>
            ))}
          </VStack>
        ) : null}

        {activeSelectedAddons.length > 0 ? (
          <VStack gap={1}>
            <Text type="label" weight="semibold">
              Extras
            </Text>
            {activeSelectedAddons.map((a) => (
              <HStack
                key={a.id}
                justify="between"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                <Text type="supporting">{a.name}</Text>
                <Text type="supporting" hasTabularNumbers>
                  +{formatCurrency(a.extraPriceCents, settings.currency)}
                </Text>
              </HStack>
            ))}
          </VStack>
        ) : null}

        <Divider />

        <VStack gap={2}>
          <HStack gap={2} align="end">
            <TextInput
              label="Cupón o Gift Card"
              placeholder="Ej. BIENVENIDA10 o GIFT500"
              value={couponInput}
              onChange={onChangeCouponInput}
              isOptional
            />
            <Button
              type="button"
              label="Aplicar"
              variant="secondary"
              onClick={onApplyCoupon}
            />
          </HStack>
          {couponError ? (
            <Text type="supporting" color="secondary">
              {couponError}
            </Text>
          ) : null}
          {appliedCoupon ? (
            <Banner
              status="success"
              title={`Código ${appliedCoupon.code} aplicado`}
              description={`Descuento de ${formatCurrency(
                appliedCoupon.discountCents,
                settings.currency,
              )}`}
            />
          ) : null}
        </VStack>

        <Divider />

        <VStack gap={1} style={{ fontVariantNumeric: 'tabular-nums' }}>
          <HStack justify="between">
            <Text color="secondary">Subtotal aproximado</Text>
            <Text hasTabularNumbers>
              {formatServicePrice(subtotalCents, hasStartingPrice, settings.currency)}
            </Text>
          </HStack>
          {appliedCoupon ? (
            <HStack justify="between">
              <Text color="accent">Descuento ({appliedCoupon.code})</Text>
              <Text color="accent" hasTabularNumbers>
                -{formatCurrency(appliedCoupon.discountCents, settings.currency)}
              </Text>
            </HStack>
          ) : null}
          <HStack justify="between">
            <Text weight="bold" size="lg">
              Total estimado
            </Text>
            <Text weight="bold" size="lg" hasTabularNumbers>
              {formatServicePrice(totalPriceCents, hasStartingPrice, settings.currency)}
            </Text>
          </HStack>
          {hasStartingPrice ? (
            <Text type="supporting" color="secondary">
              Los servicios marcados con &quot;Desde&quot; ajustan su precio final según largo y diseño.
            </Text>
          ) : null}
        </VStack>

        <Banner
          status="info"
          title="Política de cancelación y anticipo"
          description={settings.cancellationPolicyText}
        />
      </VStack>
    </Card>
  );
}
