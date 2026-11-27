import { PageSkeleton } from '@/components/ui/SkeletonBlock';

export default function AdminWhatsAppLoading() {
  return <PageSkeleton kpiCount={4} withSplit ariaLabel="Cargando panel de WhatsApp" />;
}
