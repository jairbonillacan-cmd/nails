'use client';

import { Card } from '@astryxdesign/core/Card';
import { Divider } from '@astryxdesign/core/Divider';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Link } from '@astryxdesign/core/Link';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { VStack } from '@astryxdesign/core/VStack';
import { ShieldCheck, Star } from 'lucide-react';
import { formatDateShortInTimezone } from '@/lib/format';
import type { PublicReviewDTO } from '@/lib/public-dto';

interface ServiceReviewsSectionProps {
  studioName: string;
  serviceName: string;
  timezone: string;
  serviceReviews: PublicReviewDTO[];
  studioReviews: PublicReviewDTO[];
  serviceAverage: number | null;
  studioAverage: number | null;
  studioReviewCount: number;
  googleReviewUrl?: string | null;
}

const STAR_INDICES = [1, 2, 3, 4, 5] as const;

function resolveSafeHttpsUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function ServiceReviewsSection({
  studioName,
  serviceName,
  timezone,
  serviceReviews,
  studioReviews,
  serviceAverage,
  studioAverage,
  studioReviewCount,
  googleReviewUrl,
}: ServiceReviewsSectionProps) {
  const hasServiceReviews = serviceReviews.length > 0;
  const visibleReviews = hasServiceReviews
    ? serviceReviews
    : studioReviews.slice(0, 3);
  const safeGoogleReviewUrl = resolveSafeHttpsUrl(googleReviewUrl);

  return (
    <VStack
      as="section"
      aria-labelledby="srv-reviews-heading"
      className="lk-root"
      gap={0}
    >
      <Divider />
      <VStack gap={5} className="rb-wrap" paddingBlock={8}>
        <HStack justify="between" align="end" wrap="wrap" gap={3} width="100%">
          <VStack gap={1} maxWidth={680}>
            <Heading level={2} id="srv-reviews-heading" className="lk-serif rb-h2">
              {hasServiceReviews
                ? `Opiniones verificadas de ${serviceName}`
                : `Opiniones verificadas en ${studioName}`}
            </Heading>
            <Text type="supporting" color="secondary" textWrap="pretty">
              {hasServiceReviews
                ? `Reseñas publicadas únicamente por clientas que completaron su cita de ${serviceName}.`
                : `${serviceName} aún está recibiendo sus primeras reseñas dedicadas. Mientras tanto, así califican nuestras clientas verificadas a ${studioName}.`}
            </Text>
          </VStack>

          <HStack gap={2} align="center" wrap="wrap">
            {hasServiceReviews && serviceAverage !== null ? (
              <>
                <Token
                  label={`${serviceAverage.toFixed(1)} / 5 en ${serviceName}`}
                  size="md"
                  icon={<Star size={14} aria-hidden="true" />}
                />
                <Token
                  label={`${serviceReviews.length} ${serviceReviews.length === 1 ? 'reseña verificada' : 'reseñas verificadas'}`}
                  size="md"
                  icon={<ShieldCheck size={14} aria-hidden="true" />}
                />
              </>
            ) : null}

            {studioReviewCount > 0 && studioAverage !== null ? (
              <Token
                label={`Estudio: ${studioAverage.toFixed(1)} / 5 (${studioReviewCount})`}
                size="md"
                icon={<Star size={14} aria-hidden="true" />}
              />
            ) : null}
          </HStack>
        </HStack>

        {visibleReviews.length > 0 ? (
          <Grid columns={{ minWidth: 260, max: 3 }} gap={4} width="100%" className="fx-stagger">
            {visibleReviews.map((review) => (
              <Card key={review.id} padding={5} variant="default" elevation="low" className="fx-card-lift">
                <VStack gap={3} justify="between" height="100%">
                  <VStack gap={2}>
                    <HStack justify="between" align="center" gap={2} wrap="wrap">
                      <HStack gap={1.5} align="center">
                        <HStack gap={0.5} align="center" className="lk-cereza-text">
                          {STAR_INDICES.map((star) => (
                            <Star
                              key={star}
                              size={14}
                              aria-hidden="true"
                              fill={star <= review.rating ? 'currentColor' : 'none'}
                            />
                          ))}
                        </HStack>
                        <Text type="label" weight="semibold" hasTabularNumbers>
                          {review.rating}.0 / 5
                        </Text>
                      </HStack>
                      <Token label="Cita verificada" size="sm" color="green" />
                    </HStack>

                    <Text as="p" type="body" textWrap="pretty">
                      “{review.comment}”
                    </Text>
                  </VStack>

                  <HStack justify="between" align="center" gap={2}>
                    <Text type="label" weight="semibold">
                      {review.clientFirstName}
                    </Text>
                    <Text type="supporting" color="secondary" hasTabularNumbers>
                      {formatDateShortInTimezone(review.createdAt, timezone)}
                    </Text>
                  </HStack>
                </VStack>
              </Card>
            ))}
          </Grid>
        ) : (
          <Card padding={5} variant="default" width="100%">
            <Text type="supporting" color="secondary">
              Cuando las clientas completan su servicio reciben una invitación
              personal para compartir su calificación verificada aquí.
            </Text>
          </Card>
        )}

        {safeGoogleReviewUrl ? (
          <Link href={safeGoogleReviewUrl} isExternalLink type="supporting">
            Ver más reseñas de {studioName} en Google
          </Link>
        ) : null}
      </VStack>
    </VStack>
  );
}
