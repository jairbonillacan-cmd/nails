'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import NextLink from 'next/link';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { ChevronLeft, CircleHelp, Timer } from 'lucide-react';
import type { PublicSettingsDTO } from '@/lib/public-dto';
import { LANDING_ASSETS } from '../landing/landingContent';
import { BOOKING_STEPS, type BookingStep } from './bookingMachine';

const BookingHelpDialog = dynamic(
  () => import('./BookingHelpDialog').then((mod) => mod.BookingHelpDialog),
  { ssr: false },
);

export const STEP_LABELS: Readonly<Record<BookingStep, string>> = {
  service: 'Servicio',
  extras: 'Extras',
  schedule: 'Día y hora',
  staff: 'Profesional',
  design: 'Tu diseño',
  details: 'Tus datos',
  payment: 'Pago',
};

export function formatHoldClock(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

interface BookingHeaderProps {
  settings: PublicSettingsDTO;
  holdRemainingSec?: number;
  onBack?: (() => void) | null;
}

export function BookingHeader({
  settings,
  holdRemainingSec = 0,
  onBack = null,
}: BookingHeaderProps) {
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [hasOpenedHelp, setHasOpenedHelp] = useState(false);
  const salonName = settings.name;

  return (
    <header className="rb-header">
      <nav className="rb-header-bar" aria-label="Navegación principal">
        <HStack align="center">
          {onBack ? (
            <button type="button" className="rb-ghost fx-press" onClick={onBack} aria-label="Paso anterior">
              <ChevronLeft size={20} aria-hidden="true" />
              <Text color="inherit" weight="semibold" className="rb-d">
                Atrás
              </Text>
            </button>
          ) : (
            <NextLink className="rb-ghost fx-press" href="/" aria-label="Volver al inicio">
              <ChevronLeft size={20} aria-hidden="true" />
              <Text color="inherit" weight="semibold" className="rb-d">
                Inicio
              </Text>
            </NextLink>
          )}
        </HStack>
        <NextLink href="/" aria-label={`${salonName}, inicio`} className="rb-logo-link">
          <img
            className="rb-logo"
            src={LANDING_ASSETS.logoWhite}
            alt={salonName}
            width={120}
            height={50}
            fetchPriority="high"
            decoding="async"
          />
        </NextLink>
        <HStack align="center" justify="end" gap={1}>
          {holdRemainingSec > 0 ? (
            <p
              className="rb-timer fx-tabular fx-pop"
              role="timer"
              aria-live="off"
              aria-label={
                holdRemainingSec <= 60
                  ? 'Menos de un minuto restante de apartado'
                  : 'Tiempo restante de apartado'
              }
              data-urgent={holdRemainingSec <= 60 ? 'true' : 'false'}
            >
              <Timer size={14} aria-hidden="true" />
              {formatHoldClock(holdRemainingSec)}
            </p>
          ) : null}
          <button
            type="button"
            className="rb-ghost fx-press"
            aria-label="Ayuda y preguntas frecuentes"
            aria-haspopup="dialog"
            onClick={() => {
              setHasOpenedHelp(true);
              setIsHelpOpen(true);
            }}
          >
            <CircleHelp size={20} aria-hidden="true" />
            <Text color="inherit" weight="semibold" className="rb-d">
              Ayuda
            </Text>
          </button>
        </HStack>
      </nav>
      {hasOpenedHelp ? (
        <BookingHelpDialog isOpen={isHelpOpen} settings={settings} onOpenChange={setIsHelpOpen} />
      ) : null}
    </header>
  );
}

interface BookingHeroProps {
  step: BookingStep;
  completedSteps: ReadonlySet<BookingStep>;
  onGoToStep: (step: BookingStep) => void;
  isCompact?: boolean;
  holdRemainingSec?: number;
}

export function BookingHero({
  step,
  completedSteps,
  onGoToStep,
  isCompact = false,
  holdRemainingSec = 0,
}: BookingHeroProps) {
  const stepIndex = BOOKING_STEPS.indexOf(step);

  if (isCompact) {
    return (
      <VStack as="section" className="rb-hero" data-compact="true" aria-labelledby="rb-title">
        <VStack gap={2} className="rb-wrap rb-hero-inner">
          <HStack justify="between" align="center" wrap="wrap" gap={2}>
            <Heading level={1} id="rb-title" color="inherit" className="lk-serif rb-hero-title">
              Reserva tu cita
            </Heading>
            <HStack align="center" gap={2}>
              {holdRemainingSec > 0 ? (
                <p
                  className="rb-timer fx-tabular fx-pop"
                  role="timer"
                  aria-live="off"
                  aria-label={
                    holdRemainingSec <= 60
                      ? 'Menos de un minuto restante de apartado'
                      : 'Tiempo restante de apartado'
                  }
                  data-urgent={holdRemainingSec <= 60 ? 'true' : 'false'}
                >
                  <Timer size={14} aria-hidden="true" />
                  {formatHoldClock(holdRemainingSec)}
                </p>
              ) : null}
              <Text color="inherit" type="supporting" weight="semibold">
                Paso {stepIndex + 1} de {BOOKING_STEPS.length} · {STEP_LABELS[step]}
              </Text>
            </HStack>
          </HStack>
        </VStack>
      </VStack>
    );
  }

  return (
    <VStack as="section" className="rb-hero" aria-labelledby="rb-title">
      <VStack gap={4} className="rb-wrap rb-hero-inner">
        <HStack justify="between" align="end" wrap="wrap" gap={2}>
          <VStack gap={1}>
            <Heading level={1} id="rb-title" color="inherit" className="lk-serif rb-hero-title">
              Reserva tu cita
            </Heading>
            <img
              className="rb-hero-stroke"
              src={LANDING_ASSETS.strokePorcelain}
              alt=""
              aria-hidden="true"
              width={180}
              height={20}
              loading="lazy"
              fetchPriority="low"
              decoding="async"
            />
          </VStack>
        </HStack>

        <ol className="rb-stepper rb-d" aria-label="Pasos">
          {BOOKING_STEPS.map((item, index) => {
            const isCurrent = item === step;
            const isDone = completedSteps.has(item) && !isCurrent;
            const isReachable = index < stepIndex;
            return (
              <li key={item}>
                <button
                  type="button"
                  className="rb-step fx-press"
                  data-current={isCurrent ? 'true' : 'false'}
                  aria-current={isCurrent ? 'step' : undefined}
                  disabled={!isReachable}
                  onClick={() => onGoToStep(item)}
                >
                  <Text color="inherit" weight="bold" className="rb-step-dot" data-on={isCurrent || isDone ? 'true' : 'false'}>
                    {isDone ? '✓' : String(index + 1)}
                  </Text>
                  <VStack gap={0}>
                    <Text color="inherit" type="supporting" className="rb-step-kicker">
                      Paso {index + 1}
                    </Text>
                    <Text color="inherit" weight="semibold">
                      {STEP_LABELS[item]}
                    </Text>
                  </VStack>
                </button>
              </li>
            );
          })}
        </ol>

        <VStack gap={1.5} className="rb-m rb-hero-mobile">
          <Text color="inherit">
            <Text color="inherit" weight="bold">
              Paso {stepIndex + 1} de {BOOKING_STEPS.length}
            </Text>{' '}
            · {STEP_LABELS[step]}
          </Text>
          <ol className="rb-segments" aria-hidden="true">
            {BOOKING_STEPS.map((item, index) => (
              <li
                key={item}
                className="rb-segment"
                data-state={index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo'}
              />
            ))}
          </ol>
        </VStack>
      </VStack>
      <svg className="rb-hero-wave" viewBox="0 0 1440 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40h1440V22c-120-14-240-20-360-12S840 34 720 34 480 14 360 10 120 20 0 26Z" />
      </svg>
    </VStack>
  );
}
