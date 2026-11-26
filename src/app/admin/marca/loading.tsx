import { PageSkeleton } from '@/components/ui';

export default function AdminMarcaLoading() {
  return (
    <PageSkeleton
      kpiCount={4}
      withSplit
      ariaLabel="Cargando configuración de página y marca"
    />
  );
}
