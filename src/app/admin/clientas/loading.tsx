import { PageSkeleton } from '@/components/ui/SkeletonBlock';

export default function AdminClientasLoading() {
  return <PageSkeleton kpiCount={3} withSplit={false} ariaLabel="Cargando directorio de clientas" />;
}
