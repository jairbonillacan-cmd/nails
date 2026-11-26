'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import { buildSalonFaqs, type SalonFaqItem } from '@/lib/seo/structured-data';
import { normalizeInstagramHandle, resolveInstagramDmUrl } from './bookingHelpers';

function buildBookingHelpFaqs(settings: PublicSettingsDTO): readonly SalonFaqItem[] {
  const holdMinutes = settings.slotHoldMinutes || 5;
  const bookingFaqs: SalonFaqItem[] = [
    {
      id: 'help-apartado',
      question: '¿Qué pasa si se me acaba el tiempo de apartado?',
      answer: `Tu horario queda guardado ${holdMinutes} minutos mientras terminas. Antes de que se acabe te preguntamos si quieres más tiempo, y si se libera no pierdes lo que ya escribiste: solo lo vuelves a apartar.`,
    },
    {
      id: 'help-profesional',
      question: '¿Puedo elegir con quién me atiendo?',
      answer:
        'Sí. Después de escoger tu horario ves quién está libre a esa hora. Si escoges "Cualquier profesional", te atiende quien esté disponible.',
    },
  ];
  return [...bookingFaqs, ...buildSalonFaqs(settings)];
}

interface BookingHelpDialogProps {
  isOpen: boolean;
  settings: PublicSettingsDTO;
  onOpenChange: (open: boolean) => void;
}

export function BookingHelpDialog({ isOpen, settings, onOpenChange }: BookingHelpDialogProps) {
  const faqs = buildBookingHelpFaqs(settings);
  const handle = normalizeInstagramHandle(settings.instagramHandle);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="info"
      width="min(36rem, 94vw)"
      maxHeight="85dvh"
      padding={5}
    >
      <VStack gap={4} className="lk-portal fx-sheet-in">
        <DialogHeader
          title="Preguntas frecuentes"
          subtitle="Lo que más nos preguntan antes de agendar."
          onOpenChange={onOpenChange}
        />
        <CollapsibleGroup type="single" hasDividers density="balanced">
          {faqs.map((faq) => (
            <Collapsible
              key={faq.id}
              value={faq.id}
              trigger={
                <Text weight="semibold" textWrap="pretty">
                  {faq.question}
                </Text>
              }
            >
              <VStack paddingBlockStart={1} paddingBlockEnd={2}>
                <Text color="secondary" textWrap="pretty">
                  {faq.answer}
                </Text>
              </VStack>
            </Collapsible>
          ))}
        </CollapsibleGroup>
        <Card padding={4} variant="default" elevation="low" width="100%">
          <VStack gap={3}>
            <VStack gap={0.5}>
              <Heading level={3} className="lk-serif">
                ¿No encontraste tu respuesta?
              </Heading>
              <Text type="supporting" color="secondary" textWrap="pretty">
                Mándanos un DM a {handle} y te contestamos en cuanto podamos.
              </Text>
            </VStack>
            <Button
              label={`Escribir a ${handle}`}
              variant="primary"
              size="lg"
              className="fx-press"
              href={resolveInstagramDmUrl(settings)}
              target="_blank"
              rel="noopener noreferrer"
            />
          </VStack>
        </Card>
      </VStack>
    </Dialog>
  );
}
