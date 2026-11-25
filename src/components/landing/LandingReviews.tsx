import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Carousel } from '@astryxdesign/core/Carousel';
import { Link } from '@astryxdesign/core/Link';
import type { PublicReviewDTO } from '@/lib/public-dto';
import { SectionHeading } from './LandingParts';

const REVIEW_DATE = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric' });

function formatReviewDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : REVIEW_DATE.format(date);
}

interface LandingReviewsProps {
  reviews: PublicReviewDTO[];
  summary: { count: number; average: number };
  reviewUrl: string;
}

export function LandingReviews({ reviews, summary, reviewUrl }: LandingReviewsProps) {
  const average = summary.average.toFixed(1).replace('.', ',');
  return (
    <VStack as="section" aria-labelledby="resenas-t" className="lk-section">
      <VStack gap={8} className="lk-wrap">
        <SectionHeading
          id="resenas-t"
          title="De tu idea a tus uñas"
          subtitle="Lo que dicen quienes ya salieron con su set."
          tone="cereza"
        />
        <HStack gap={6} align="center" wrap="wrap" className="lk-reveal">
          <VStack gap={1} align="center" style={{ flex: '1 1 13rem', textAlign: 'center' }}>
            <Text weight="bold" size="xl">EXCELENTE</Text>
            <VStack className="lk-cereza-text">
              <Text size="3xl" color="inherit" aria-label={`${average} de 5 estrellas`}>★★★★★</Text>
            </VStack>
            <Text>
              {average} · <Text weight="bold">{summary.count} {summary.count === 1 ? 'reseña' : 'reseñas'}</Text> en Google
            </Text>
            <Link href={reviewUrl} isExternalLink>
              Escribir una reseña
            </Link>
          </VStack>
          {reviews.length > 0 ? (
            <VStack style={{ flex: '999 1 36rem', minWidth: 0 }}>
              <Carousel gap={4} hasSnap aria-label="Reseñas de clientas">
                {reviews.map((review) => (
                  <VStack key={review.id} gap={3} padding={6} className="lk-card lk-review" style={{ width: 'min(20rem, 78vw)' }}>
                    <HStack gap={3} align="center">
                      <VStack className="lk-initial" aria-hidden="true">
                        {review.clientFirstName.slice(0, 1).toUpperCase()}
                      </VStack>
                      <VStack gap={0}>
                        <Text weight="semibold">{review.clientFirstName}</Text>
                        <Text type="supporting" color="secondary">
                          {formatReviewDate(review.createdAt)}
                        </Text>
                      </VStack>
                    </HStack>
                    <VStack className="lk-cereza-text">
                      <Text color="inherit" aria-label={`${review.rating} de 5 estrellas`}>
                        {'★'.repeat(review.rating)}
                      </Text>
                    </VStack>
                    <Text textWrap="pretty">{review.comment}</Text>
                  </VStack>
                ))}
              </Carousel>
            </VStack>
          ) : null}
        </HStack>
      </VStack>
    </VStack>
  );
}
