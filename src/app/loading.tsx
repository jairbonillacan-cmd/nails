import { ViewTransition } from 'react';
import { BrandStage } from '@/components/brand/BrandStage';

export default function HomeLoading() {
  return (
    <ViewTransition enter="lk-page-in" exit="lk-fade-out" default="none">
      <BrandStage role="status" eyebrow="Laikona Nails" title="Abriendo el estudio" />
    </ViewTransition>
  );
}
