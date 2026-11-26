import { PageSkeleton } from '@/components/ui/SkeletonBlock';

export default function AdminEquipoLoading() {
  return <PageSkeleton kpiCount={3} withSplit ariaLabel="Cargando equipo y permisos" />;
}
