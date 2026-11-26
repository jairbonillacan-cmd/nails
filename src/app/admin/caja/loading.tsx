import { PageSkeleton } from '@/components/ui/SkeletonBlock';

export default function AdminCajaLoading() {
  return <PageSkeleton kpiCount={4} withSplit={false} ariaLabel="Cargando caja y cobros" />;
}
