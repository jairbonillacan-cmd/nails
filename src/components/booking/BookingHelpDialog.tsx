'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { Dialog } from '@astryxdesign/core/Dialog';
import { X } from 'lucide-react';
import { BrandIcon } from '@/components/brand/BrandIcon';
import type { BrandIconName } from '@/lib/brand-icons';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import { buildSalonFaqs, type SalonFaqItem } from '@/lib/seo/structured-data';
import { normalizeInstagramHandle, resolveInstagramDmUrl } from './bookingHelpers';

interface HelpFaq extends SalonFaqItem {
  icon: BrandIconName;
}

interface HelpGroup {
  id: string;
  title: string;
  items: readonly HelpFaq[];
}

const BOOKING_FAQ_IDS = new Set(['faq-anticipo', 'faq-reagendar']);

const FAQ_ICONS: Readonly<Record<string, BrandIconName>> = {
  'help-apartado': 'duracion',
  'help-profesional': 'cualquier-profesional',
  'faq-anticipo': 'transferencia-spei',
  'faq-reagendar': 'calendario',
  'faq-retoque': 'unas-esculturales',
  'faq-ubicacion': 'ubicacion',
  'faq-extras': 'nail-art-3d',
  'faq-sellos': 'cupon',
};

function withIcon(item: SalonFaqItem): HelpFaq {
  return { ...item, icon: FAQ_ICONS[item.id] ?? 'ayuda' };
}

function buildHelpGroups(settings: PublicSettingsDTO): readonly HelpGroup[] {
  const holdMinutes = settings.slotHoldMinutes || 5;
  const salonFaqs = buildSalonFaqs(settings);
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
    ...salonFaqs.filter((faq) => BOOKING_FAQ_IDS.has(faq.id)),
  ];
  return [
    { id: 'reserva', title: 'Tu reserva', items: bookingFaqs.map(withIcon) },
    {
      id: 'estudio',
      title: 'El estudio',
      items: salonFaqs.filter((faq) => !BOOKING_FAQ_IDS.has(faq.id)).map(withIcon),
    },
  ];
}

interface BookingHelpDialogProps {
  isOpen: boolean;
  settings: PublicSettingsDTO;
  onOpenChange: (open: boolean) => void;
}

export function BookingHelpDialog({ isOpen, settings, onOpenChange }: BookingHelpDialogProps) {
  const groups = buildHelpGroups(settings);
  const handle = normalizeInstagramHandle(settings.instagramHandle);

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="info"
      width="min(38rem, 100vw)"
      maxHeight="min(46rem, 88dvh)"
      padding={0}
      aria-labelledby="rb-help-title"
    >
      <VStack gap={0} className="lk-portal rb-help">
        <HStack as="header" className="rb-help-head" gap={3} align="center" justify="between">
          <HStack gap={3} align="center">
            <BrandIcon name="ayuda" size={2.25} className="rb-help-mark lk-cereza-text" />
            <VStack gap={0.5}>
              <Heading level={2} id="rb-help-title" className="lk-serif rb-help-title">
                Antes de agendar
              </Heading>
              <Text type="supporting" color="secondary">
                Respuestas cortas a lo que más nos preguntan.
              </Text>
            </VStack>
          </HStack>
          <Button
            label="Cerrar"
            variant="ghost"
            isIconOnly
            icon={<X size={18} aria-hidden="true" />}
            onClick={() => onOpenChange(false)}
          />
        </HStack>

        <VStack gap={5} className="rb-help-body">
          {groups.map((group) => (
            <VStack key={group.id} gap={1} as="section" aria-label={group.title}>
              <Text className="rb-help-eyebrow">{group.title}</Text>
              <CollapsibleGroup type="single" hasDividers density="balanced">
                {group.items.map((faq) => (
                  <Collapsible
                    key={faq.id}
                    value={faq.id}
                    trigger={
                      <HStack gap={3} align="center">
                        <BrandIcon name={faq.icon} size={1.375} className="lk-cereza-text" />
                        <Text weight="semibold" textWrap="pretty">
                          {faq.question}
                        </Text>
                      </HStack>
                    }
                  >
                    <Text color="secondary" textWrap="pretty" className="rb-help-answer">
                      {faq.answer}
                    </Text>
                  </Collapsible>
                ))}
              </CollapsibleGroup>
            </VStack>
          ))}
        </VStack>

        <HStack as="footer" className="rb-help-foot" gap={3} align="center" justify="between">
          <HStack gap={2} align="center" className="rb-help-foot-copy">
            <BrandIcon name="instagram" size={1.5} className="lk-cereza-text" />
            <VStack gap={0}>
              <Text weight="semibold" size="sm">
                ¿Otra duda?
              </Text>
              <Text type="supporting" color="secondary">
                Te contestamos en {handle}.
              </Text>
            </VStack>
          </HStack>
          <Button
            label="Escribir por DM"
            variant="primary"
            className="fx-press"
            href={resolveInstagramDmUrl(settings)}
            target="_blank"
            rel="noopener noreferrer"
          />
        </HStack>
      </VStack>
    </Dialog>
  );
}
