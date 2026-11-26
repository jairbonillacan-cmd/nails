import { z } from 'zod';
import { CentsNonNegativeSchema, NonEmptyIdSchema } from './primitives';

const ServiceInputSchema = z.object({
  id: NonEmptyIdSchema.optional(),
  categoryId: NonEmptyIdSchema.nullable().optional(),
  name: z.string().trim().min(2, 'Nombre requerido').max(120),
  slug: z.string().max(120).optional(),
  description: z.string().max(1000).optional(),
  durationMinutes: z.number().int().min(15).max(480),
  priceCents: CentsNonNegativeSchema.max(10_000_000),
  isStartingPrice: z.boolean().optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  requiresConfirmation: z.boolean().optional(),
  depositRequired: z.boolean().optional(),
  depositAmountCents: CentsNonNegativeSchema.max(10_000_000).optional(),
  allowInspoPhoto: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
  imageUrl: z.string().max(2_500_000).nullable().optional(),
});

const AddonInputSchema = z.object({
  id: NonEmptyIdSchema.optional(),
  name: z.string().trim().min(2, 'Nombre requerido').max(120),
  description: z.string().max(600).optional(),
  extraMinutes: z.number().int().min(0).max(240),
  extraPriceCents: CentsNonNegativeSchema.max(10_000_000),
  appliesToAll: z.boolean().optional(),
  serviceIds: z.array(NonEmptyIdSchema).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

export const CatalogMutationSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('addon'),
    data: AddonInputSchema,
  }),
  z.object({
    kind: z.literal('service'),
    data: ServiceInputSchema,
  }),
]);

export const StarterServiceSchema = z.object({
  id: NonEmptyIdSchema.optional(),
  name: z.string().trim().min(2, 'Nombre de servicio muy corto').max(120),
  priceCents: CentsNonNegativeSchema.max(10_000_000),
  durationMinutes: z.number().int().min(15).max(480),
  isStartingPrice: z.boolean().optional(),
});

export const CreateServicePackageSchema = z.object({
  kind: z.literal('catalog'),
  id: NonEmptyIdSchema.optional(),
  name: z.string().trim().min(2, 'Escribe un nombre para el paquete').max(120),
  description: z.string().max(400).default(''),
  serviceId: NonEmptyIdSchema,
  totalSessions: z.number().int().min(2).max(24),
  priceCents: CentsNonNegativeSchema.max(20_000_000),
  validDays: z.number().int().min(7).max(730).nullable().default(180),
  isActive: z.boolean().optional(),
});

export const AssignClientPackageSchema = z.object({
  kind: z.literal('assign'),
  clientId: NonEmptyIdSchema,
  packageId: NonEmptyIdSchema,
  notes: z.string().max(400).optional(),
});

export const PatchClientPackageSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('toggle_catalog'),
    packageId: NonEmptyIdSchema,
    isActive: z.boolean(),
  }),
  z.object({
    action: z.literal('redeem'),
    clientPackageId: NonEmptyIdSchema,
    bookingId: NonEmptyIdSchema.nullable().optional(),
  }),
  z.object({
    action: z.literal('cancel_client_package'),
    clientPackageId: NonEmptyIdSchema,
  }),
]);
