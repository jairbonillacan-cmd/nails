'use client';

import type React from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { TextArea } from '@astryxdesign/core/TextArea';
import { ExternalLink, Pencil, Star } from 'lucide-react';
import { resolveSafeHttpUrl } from './types';

interface CitaReviewCardProps {
  salonName: string;
  googleReviewUrl: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  reviewComment: string;
  reviewSaved: boolean;
  hasExistingReview?: boolean;
  errorMessage?: string | null;
  busy: boolean;
  onChangeRating: (value: 1 | 2 | 3 | 4 | 5) => void;
  onChangeComment: (value: string) => void;
  onEditReview?: () => void;
  onCancelEdit?: () => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function CitaReviewCard({
  salonName,
  googleReviewUrl,
  rating,
  reviewComment,
  reviewSaved,
  hasExistingReview = false,
  errorMessage = null,
  busy,
  onChangeRating,
  onChangeComment,
  onEditReview,
  onCancelEdit,
  onSubmit,
}: CitaReviewCardProps) {
  const safeGoogleReviewUrl = resolveSafeHttpUrl(googleReviewUrl);

  return (
    <VStack as="section" gap={4} className="ck-panel fx-fade-up" aria-labelledby="ck-review-title">
      <VStack gap={0.5}>
        <Heading level={2} id="ck-review-title" className="lk-serif rb-h2">
          ¿Cómo quedaron tus uñas?
        </Heading>
        <Text type="supporting" color="secondary" textWrap="pretty">
          Tu opinión nos ayuda muchísimo a cuidar cada detalle en {salonName}.
        </Text>
      </VStack>

      {reviewSaved ? (
        <VStack gap={3} className="fx-pop">
          <Banner
            status="success"
            title="¡Gracias por calificarnos!"
            description={`Registramos tu calificación de ${rating}/5 estrellas.`}
          />
          {reviewComment.trim() ? (
            <VStack gap={0.5} padding={3} className="rb-card">
              <Text type="supporting" color="secondary">
                Tu comentario
              </Text>
              <Text textWrap="pretty" style={{ overflowWrap: 'anywhere' }}>
                “{reviewComment.trim()}”
              </Text>
            </VStack>
          ) : null}
          {rating >= 4 && safeGoogleReviewUrl ? (
            <VStack gap={2} padding={4} className="rb-note">
              <HStack justify="between" align="center" wrap="wrap" gap={3}>
                <VStack gap={0.5} className="rb-grow" style={{ minWidth: 0 }}>
                  <Text weight="semibold">¿Nos regalas esa reseña en Google Maps?</Text>
                  <Text type="supporting" color="secondary" textWrap="pretty">
                    Toma 15 segundos y ayuda a que más clientas conozcan {salonName}.
                  </Text>
                </VStack>
                <Button
                  label="Dejar reseña en Google"
                  variant="primary"
                  size="md"
                  className="fx-press"
                  icon={<ExternalLink size={15} aria-hidden="true" />}
                  href={safeGoogleReviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </HStack>
            </VStack>
          ) : null}
          {onEditReview ? (
            <HStack>
              <Button
                type="button"
                label="Editar mi calificación"
                variant="ghost"
                size="md"
                className="fx-press"
                icon={<Pencil size={14} aria-hidden="true" />}
                onClick={onEditReview}
              />
            </HStack>
          ) : null}
        </VStack>
      ) : (
        <form onSubmit={onSubmit}>
          <VStack gap={3}>
            {errorMessage ? (
              <VStack className="fx-fade-up">
                <Banner
                  status="error"
                  title="No se pudo guardar tu calificación"
                  description={errorMessage}
                />
              </VStack>
            ) : null}
            <HStack gap={2} wrap="wrap" role="group" aria-label="Calificación con estrellas">
              {([1, 2, 3, 4, 5] as const).map((star) => (
                <Button
                  key={star}
                  type="button"
                  label={`${star} ★`}
                  variant={rating === star ? 'primary' : 'secondary'}
                  size="md"
                  className="fx-press fx-tabular"
                  aria-pressed={rating === star}
                  isDisabled={busy}
                  icon={<Star size={15} aria-hidden="true" />}
                  onClick={() => onChangeRating(star)}
                />
              ))}
            </HStack>
            <TextArea
              label="Cuéntanos qué te gustó o qué podemos mejorar"
              placeholder="Ej. Me encantó el acabado, la puntualidad y el ambiente..."
              value={reviewComment}
              onChange={onChangeComment}
              isDisabled={busy}
              isOptional
            />
            {rating >= 4 && safeGoogleReviewUrl ? (
              <Text type="supporting" color="secondary" textWrap="pretty">
                Al enviar tu calificación también podrás compartirla en Google Maps en un clic.
              </Text>
            ) : null}
            <HStack gap={2} wrap="wrap">
              <Button
                type="submit"
                label={busy ? 'Guardando calificación...' : 'Enviar mi calificación'}
                variant="primary"
                className="fx-press"
                isLoading={busy}
                isDisabled={busy}
              />
              {hasExistingReview && onCancelEdit ? (
                <Button
                  type="button"
                  label="Cancelar"
                  variant="ghost"
                  className="fx-press"
                  isDisabled={busy}
                  onClick={onCancelEdit}
                />
              ) : null}
            </HStack>
          </VStack>
        </form>
      )}
    </VStack>
  );
}
