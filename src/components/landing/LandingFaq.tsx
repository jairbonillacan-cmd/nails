'use client';

import { Button } from '@astryxdesign/core/Button';
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { SALON_FAQS, type SalonFaqItem } from '@/lib/seo/structured-data';

interface LandingFaqProps {
  title?: string;
  subtitle?: string;
  faqs?: readonly SalonFaqItem[];
  whatsappUrl: string;
}

export function LandingFaq({
  title = 'Preguntas frecuentes',
  subtitle = 'Lo que más nos preguntan antes de su primera cita.',
  faqs = SALON_FAQS,
  whatsappUrl,
}: LandingFaqProps) {
  return (
    <VStack as="section" id="preguntas" aria-labelledby="preguntas-t" className="lk-section">
      <VStack className="lk-wrap lk-faq">
        <VStack gap={3} className="lk-faq-intro lk-reveal">
          <Heading level={2} id="preguntas-t" color="inherit" className="lk-serif lk-h2">
            {title}
          </Heading>
          <Text color="secondary" textWrap="pretty">
            {subtitle}
          </Text>
          <HStack gap={2} wrap="wrap" align="center" className="lk-faq-more">
            <Text color="secondary">¿Otra duda?</Text>
            <Button
              label="Escríbenos"
              variant="secondary"
              size="md"
              className="fx-press"
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
            />
          </HStack>
        </VStack>

        <VStack className="lk-faq-list lk-reveal-2">
          <CollapsibleGroup type="single" hasDividers density="spacious">
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
                <VStack paddingBlockStart={1} paddingBlockEnd={3}>
                  <Text color="secondary" textWrap="pretty">
                    {faq.answer}
                  </Text>
                </VStack>
              </Collapsible>
            ))}
          </CollapsibleGroup>
        </VStack>
      </VStack>
    </VStack>
  );
}
