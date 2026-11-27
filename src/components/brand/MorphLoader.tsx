import { VStack } from '@astryxdesign/core/VStack';

const DOTS = [0, 1, 2, 3] as const;

interface MorphLoaderProps {
  size?: 'sm' | 'lg';
  tone?: 'light' | 'cherry';
}

export function MorphLoader({ size = 'lg', tone = 'light' }: MorphLoaderProps) {
  return (
    <VStack className="lk-morph" data-size={size} data-tone={tone} aria-hidden="true">
      {DOTS.map((i) => (
        <VStack key={i} className="lk-morph-dot" data-i={String(i)} />
      ))}
    </VStack>
  );
}
