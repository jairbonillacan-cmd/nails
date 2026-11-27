'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { roleCanAccess } from '@/lib/rbac';
import type { AdminRole } from '@/lib/types';

interface AdminAccessGuardProps {
  role: AdminRole;
  section: string;
  sectionLabel: string;
  children: React.ReactNode;
}

export function AdminAccessGuard({
  role,
  section,
  sectionLabel,
  children,
}: AdminAccessGuardProps) {
  if (roleCanAccess(role, section)) {
    return <>{children}</>;
  }

  return (
    <VStack className="ad-page" gap={4}>
      <Banner
        status="warning"
        role="status"
        title={`No tienes acceso a ${sectionLabel}`}
        description="Tu perfil actual no incluye permisos para ver o editar esta sección del salón."
        endContent={
          <Button
            label="Volver al resumen"
            variant="secondary"
            size="sm"
            href="/admin"
          />
        }
      />
    </VStack>
  );
}
