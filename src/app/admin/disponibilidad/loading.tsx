import { PageSkeleton } from '@/components/ui';

export default function AdminDisponibilidadLoading() {
  return (
    <PageSkeleton
      kpiCount={3}
      withSplit={false}
      ariaLabel="Cargando disponibilidad y horarios"
    />
  );
}
