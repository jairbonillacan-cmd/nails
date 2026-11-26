import { PageSkeleton } from '@/components/ui/SkeletonBlock';

export default function AdminOnboardingLoading() {
  return <PageSkeleton kpiCount={0} withSplit={false} ariaLabel="Cargando guía inicial del salón" />;
}
