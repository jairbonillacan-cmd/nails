import { PageSkeleton } from '@/components/ui/SkeletonBlock';

export default function AdminInventarioLoading() {
  return <PageSkeleton kpiCount={3} withSplit={false} ariaLabel="Cargando inventario de productos" />;
}
