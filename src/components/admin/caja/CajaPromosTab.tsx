'use client';

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import type { Coupon, Service } from '@/lib/types';
import type { FormSubmitResult } from '@/lib/forms/form-submit';
import { FilterPillBar, type FilterPillOption } from '@/components/ui';
import type { SaveCajaPackageInput } from './cajaActions';
import type { CouponPayloadData } from './cajaMetrics';
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
  tz: string;
  nowMs: number;
  canManagePackages: boolean;
  togglingCouponId: string | null;
  deletingCouponId: string | null;
  togglingPkgId: string | null;
  onSaveCoupon: (data: CouponPayloadData) => Promise<FormSubmitResult>;
  onToggleCouponActive: (coupon: Coupon, nextActive: boolean) => Promise<void>;
  onRequestDeleteCoupon: (coupon: Coupon) => void;
  onSavePackage: (input: SaveCajaPackageInput) => Promise<FormSubmitResult>;
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
  tz,
  nowMs,
  canManagePackages,
  togglingCouponId,
  deletingCouponId,
  togglingPkgId,
  onSaveCoupon,
  onToggleCouponActive,
  onRequestDeleteCoupon,
  onSavePackage,
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
          tz={tz}
          nowMs={nowMs}
          canManageCoupons={canManagePackages}
          togglingCouponId={togglingCouponId}
          deletingCouponId={deletingCouponId}
          onSaveCoupon={onSaveCoupon}
          onToggleCouponActive={onToggleCouponActive}
          onRequestDeleteCoupon={onRequestDeleteCoupon}
        />
      ) : (
        <PackagesSubSection
          packagesCatalog={packagesCatalog}
          packagesLoading={packagesLoading}
          services={services}
          currency={currency}
          canManagePackages={canManagePackages}
          togglingPkgId={togglingPkgId}
          onSavePackage={onSavePackage}
          onTogglePackage={onTogglePackage}
        />
      )}
    </VStack>
  );
}
