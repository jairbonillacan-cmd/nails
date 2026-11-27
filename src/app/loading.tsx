import { ViewTransition } from 'react';
import { BrandLoader } from '@/components/brand/BrandLoader';

export default function HomeLoading() {
  return (
    <ViewTransition enter="lk-page-in" exit="lk-fade-out" default="none">
      <BrandLoader label="Abriendo el estudio" />
    </ViewTransition>
  );
}
