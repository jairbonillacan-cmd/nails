import { PageSkeleton } from '@/components/ui/SkeletonBlock';

export default function AdminReportesLoading() {
  return <PageSkeleton kpiCount={6} withSplit ariaLabel="Cargando reportes del salón" />;
}
