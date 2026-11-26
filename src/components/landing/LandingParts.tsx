import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { LANDING_ASSETS } from './landingContent';

type Tone = 'ink' | 'cereza' | 'light';

const TONE_CLASS: Record<Tone, string> = {
  ink: '',
  cereza: 'lk-cereza-text',
  light: 'lk-on-cereza',
};

interface SectionHeadingProps {
  id: string;
  title: string;
  subtitle?: string;
  tone?: Tone;
  align?: 'center' | 'start';
}

export function SectionHeading({
  id,
  title,
  subtitle,
  tone = 'ink',
  align = 'center',
}: SectionHeadingProps) {
  const isCentered = align === 'center';
  const stroke = tone === 'light' ? LANDING_ASSETS.strokePorcelain : LANDING_ASSETS.strokeCereza;
  return (
    <VStack
      gap={2}
      align={isCentered ? 'center' : 'start'}
      className={TONE_CLASS[tone]}
      style={{ textAlign: isCentered ? 'center' : 'start' }}
    >
      <Heading
        level={2}
        id={id}
        color="inherit"
        textWrap="balance"
        className="lk-serif lk-h2 lk-reveal"
      >
        {title}
      </Heading>
      <img
        className="lk-draw"
        src={stroke}
        alt=""
        width={460}
        height={79}
        loading="lazy"
        decoding="async"
        style={{ width: isCentered ? 'min(28rem, 76%)' : 'min(17rem, 68%)', height: 'auto' }}
      />
      {subtitle ? (
        <VStack className={tone === 'light' ? 'lk-reveal-2 lk-soft' : 'lk-reveal-2'}>
          <Text type="large" color={tone === 'ink' ? 'secondary' : 'inherit'} textWrap="pretty">
            {subtitle}
          </Text>
        </VStack>
      ) : null}
    </VStack>
  );
}

export function WaveTop() {
  return (
    <svg className="lk-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 0h1440v34c-90 30-180 46-270 40S990 30 900 22 720 30 630 46 450 70 360 62 180 26 90 22 0 34 0 34Z" />
    </svg>
  );
}

export function WaveBottom() {
  return (
    <svg className="lk-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 90h1440V48c-90-26-180-40-270-32S990 62 900 70 720 60 630 44 450 18 360 26 180 64 90 68 0 56 0 56Z" />
    </svg>
  );
}
