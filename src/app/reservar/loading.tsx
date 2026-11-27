import '../booking.css';
import { ViewTransition } from 'react';
import { BrandLoader } from '@/components/brand/BrandLoader';

export default function ReservarLoading() {
  return (
    <ViewTransition enter="lk-page-in" exit="lk-fade-out" default="none">
      <BrandLoader label="Cargando agenda de reservas" />
    </ViewTransition>
  );
}
