'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import type { Coupon, Service } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import type { PromosSubTab, ServicePackageCatalogRow } from './cajaTypes';
import { CouponsSubSection } from './CouponsSubSection';
import { PackagesSubSection } from './PackagesSubSection';

interface CajaPromosTabProps {
  subTab: PromosSubTab;
  onSubTabChange: (next: PromosSubTab) => void;
  coupons: readonly Coupon[];
  packagesCatalog: readonly ServicePackageCatalogRow[];
  packagesLoading: boolean;
  services: readonly Service[];
  currency: 'MXN' | 'USD';
  canManagePackages: boolean;
  togglingPkgId: string | null;
  onCreateCoupon: (input: {
    code: string;
    kind: 'coupon' | 'gift_card';
    discountType: 'percent' | 'fixed_cents';
    value: number;
    recipient: string;
  }) => Promise<FormSubmitResult>;
  onCreatePackage: (input: {
    name: string;
    description: string;
    serviceId: string;
    totalSessions: number;
    priceMxn: number;
    validDays: number;
  }) => Promise<FormSubmitResult>;
  onTogglePackage: (pkg: ServicePackageCatalogRow, nextActive: boolean) => Promise<void>;
}

export function CajaPromosTab({
  subTab,
  onSubTabChange,
  coupons,
  packagesCatalog,
  packagesLoading,
  services,
  currency,
  canManagePackages,
  togglingPkgId,
  onCreateCoupon,
  onCreatePackage,
  onTogglePackage,
}: CajaPromosTabProps) {
  const subTabOptions: FilterPillOption<PromosSubTab>[] = [
    { value: 'coupons', label: 'Cupones y tarjetas', count: coupons.length },
    { value: 'packages', label: 'Paquetes de sesiones', count: packagesCatalog.length },
  ];

  return (
    <VStack gap={4} className="fx-step-in">
      <HStack className="ad-toolbar" justify="between" align="center" wrap="wrap" gap={2}>
        <FilterPillBar
          ariaLabel="Sección de promociones y paquetes"
          mode="segmented"
          value={subTab}
          options={subTabOptions}
          onChange={onSubTabChange}
        />
      </HStack>

      {subTab === 'coupons' ? (
        <CouponsSubSection
          coupons={coupons}
          currency={currency}
          onCreateCoupon={onCreateCoupon}
        />
      ) : (
        <PackagesSubSection
          packagesCatalog={packagesCatalog}
          packagesLoading={packagesLoading}
          services={services}
          currency={currency}
          canManagePackages={canManagePackages}
          togglingPkgId={togglingPkgId}
          onCreatePackage={onCreatePackage}
          onTogglePackage={onTogglePackage}
        />
      )}
    </VStack>
  );
}
