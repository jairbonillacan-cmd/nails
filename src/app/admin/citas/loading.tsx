import { PageSkeleton } from '@/components/ui';

export default function AdminCitasLoading() {
  return <PageSkeleton kpiCount={3} withSplit={false} ariaLabel="Cargando citas y agenda" />;
}
