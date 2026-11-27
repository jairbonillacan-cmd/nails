import { CAJA_EXPENSE_CATEGORY_MAX, CajaConfigSchema } from '@/lib/contracts/brand';
import type { CajaConfig, LandingContent } from '@/lib/types';

export const DEFAULT_CAJA_EXPENSE_CATEGORIES: readonly string[] = [
  'Geles / acrílico',
  'Limas y desechables',
  'Esterilización',
  'Renta / servicios',
  'Pago a profesional',
];

export const DEFAULT_RETAIL_COMMISSION_PERCENT = 10;

export const DEFAULT_CAJA_CONFIG: CajaConfig = {
  openingFloatCents: 0,
  expenseCategories: [...DEFAULT_CAJA_EXPENSE_CATEGORIES],
  retailCommissionPercent: DEFAULT_RETAIL_COMMISSION_PERCENT,
  defaultPeriod: 'all',
  closeSummary: {
    includeStaffBreakdown: true,
    includeTips: true,
    includePending: true,
  },
};

export function resolveCajaConfig(
  landingContent: Pick<LandingContent, 'cajaConfig'> | null | undefined,
): CajaConfig {
  const parsed = CajaConfigSchema.safeParse(landingContent?.cajaConfig);
  if (!parsed.success) {
    return {
      ...DEFAULT_CAJA_CONFIG,
      expenseCategories: [...DEFAULT_CAJA_CONFIG.expenseCategories],
      closeSummary: { ...DEFAULT_CAJA_CONFIG.closeSummary },
    };
  }
  return {
    ...parsed.data,
    expenseCategories: [...parsed.data.expenseCategories],
    closeSummary: { ...parsed.data.closeSummary },
  };
}

export function normalizeExpenseCategories(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const clean = item.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (clean.length < 2) continue;
    const key = clean.toLocaleLowerCase('es');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= CAJA_EXPENSE_CATEGORY_MAX) break;
  }
  return out;
}
