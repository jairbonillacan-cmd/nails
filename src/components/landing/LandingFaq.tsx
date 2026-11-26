'use client';

import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { SALON_FAQS, type SalonFaqItem } from '@/lib/seo/structured-data';
import { SectionHeading } from './LandingParts';

interface LandingFaqProps {
  faqs?: readonly SalonFaqItem[];
  whatsappUrl: string;
}

export function LandingFaq({ faqs = SALON_FAQS, whatsappUrl }: LandingFaqProps) {
  return (
    <VStack as="section" id="preguntas" aria-labelledby="preguntas-t" className="lk-section">
      <VStack gap={6} align="center" className="lk-wrap">
        <SectionHeading
          id="preguntas-t"
          title="Preguntas frecuentes"
          subtitle="Anticipos, reagendado, retoques y todo lo que necesitas saber antes de tu cita en Puebla."
          tone="ink"
          align="center"
        />

        <VStack gap={4} width="100%" style={{ maxWidth: '54rem' }}>
          <Card padding={5} variant="default" elevation="low" width="100%" className="lk-reveal-2">
            <CollapsibleGroup
              type="single"
              hasDividers
              density="spacious"
              defaultValue={faqs[0]?.id}
            >
              {faqs.map((faq) => (
                <Collapsible
                  key={faq.id}
                  value={faq.id}
                  trigger={
                    <Text weight="semibold" size="lg" color="primary" textWrap="pretty">
                      {faq.question}
                    </Text>
                  }
                >
                  <VStack paddingBlockStart={1} paddingBlockEnd={2}>
                    <Text type="body" color="secondary" textWrap="pretty">
                      {faq.answer}
                    </Text>
                  </VStack>
                </Collapsible>
              ))}
            </CollapsibleGroup>
          </Card>

          <Card padding={5} variant="default" elevation="low" width="100%" className="lk-reveal-3">
            <HStack justify="between" align="center" wrap="wrap" gap={4} width="100%">
              <VStack gap={1} style={{ flex: '1 1 18rem', minWidth: 0 }}>
                <Heading level={3} color="inherit" className="lk-serif lk-h3">
                  ¿Tienes otra duda antes de agendar?
                </Heading>
                <Text type="supporting" color="secondary" textWrap="pretty">
                  Consulta disponibilidad en tiempo real o escríbenos directo por WhatsApp.
                </Text>
              </VStack>
              <HStack gap={2} wrap="wrap">
                <Button
                  label="Reservar cita"
                  variant="primary"
                  size="lg"
                  className="fx-press"
                  href="/reservar"
                />
                <Button
                  label="WhatsApp"
                  variant="secondary"
                  size="lg"
                  className="fx-press"
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              </HStack>
            </HStack>
          </Card>
        </VStack>
      </VStack>
    </VStack>
  );
}
