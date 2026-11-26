import { PageSkeleton } from '@/components/ui';

export default function AdminServiciosLoading() {
  return (
    <PageSkeleton
      kpiCount={3}
      withSplit
      ariaLabel="Cargando servicios y extras"
    />
  );
}
