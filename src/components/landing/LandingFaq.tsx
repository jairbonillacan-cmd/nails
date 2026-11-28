'use client';

import { BrandIcon } from '@/components/brand/BrandIcon';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { SALON_FAQS, type SalonFaqItem } from '@/lib/seo/structured-data';
import { SectionHeading, WaveBottom, WaveTop } from './LandingParts';
import { LANDING_ASSETS } from './landingContent';

interface LandingFaqProps {
  title?: string;
  subtitle?: string;
  faqs?: readonly SalonFaqItem[];
  whatsappUrl: string;
}

export function LandingFaq({
  title = 'Preguntas frecuentes',
  subtitle = 'Lo que más nos preguntan antes de tu primera cita.',
  faqs = SALON_FAQS,
  whatsappUrl,
}: LandingFaqProps) {
  return (
    <VStack as="section" id="preguntas" aria-labelledby="preguntas-t" className="lk-cereza">
      <WaveTop />
      <img
        className="lk-watermark"
        src={LANDING_ASSETS.cherriesWhite}
        alt=""
        aria-hidden="true"
        width={488}
        height={572}
        loading="lazy"
        decoding="async"
        style={{ right: '-8%', bottom: '6%', width: '36%', opacity: 0.06 }}
      />
      <VStack
        gap={8}
        className="lk-wrap"
        paddingBlockStart={6}
        paddingBlockEnd={10}
        style={{ position: 'relative' }}
      >
        <SectionHeading id="preguntas-t" title={title} subtitle={subtitle} tone="light" />

        <VStack className="lk-faq-list lk-reveal-2" gap={0}>
          <CollapsibleGroup type="single" density="spacious">
            {faqs.map((faq) => (
              <Collapsible
                key={faq.id}
                value={faq.id}
                className="lk-faq-item"
                trigger={
                  <Text weight="semibold" color="inherit" className="lk-faq-q">
                    {faq.question}
                  </Text>
                }
              >
                <VStack paddingBlockEnd={2}>
                  <Text color="inherit" className="lk-faq-a">
                    {faq.answer}
                  </Text>
                </VStack>
              </Collapsible>
            ))}
          </CollapsibleGroup>
        </VStack>

        <HStack gap={3} wrap="wrap" align="center" justify="center" className="lk-reveal-3">
          <Text color="inherit" className="lk-soft">
            ¿Tienes otra duda?
          </Text>
          <Button
            label="Escríbenos por WhatsApp"
            variant="secondary"
            size="md"
            icon={<BrandIcon name="whatsapp" size={1.25} />}
            className="lk-btn-outline fx-press"
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
          />
        </HStack>
      </VStack>
      <WaveBottom />
    </VStack>
  );
}
