import { PageSkeleton } from '@/components/ui/SkeletonBlock';

export default function AdminIntegracionesLoading() {
  return <PageSkeleton kpiCount={3} withSplit={false} ariaLabel="Cargando conexiones del salón" />;
}
