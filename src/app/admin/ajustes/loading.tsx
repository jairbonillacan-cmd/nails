import { PageSkeleton } from '@/components/ui';

export default function AdminAjustesLoading() {
  return (
    <PageSkeleton
      kpiCount={0}
      withSplit={false}
      ariaLabel="Cargando ajustes del salón"
    />
  );
}
