import { PageSkeleton } from '@/components/ui';

export default function AdminFidelizacionLoading() {
  return (
    <PageSkeleton
      kpiCount={4}
      withSplit={false}
      ariaLabel="Cargando programa de fidelización"
    />
  );
}
