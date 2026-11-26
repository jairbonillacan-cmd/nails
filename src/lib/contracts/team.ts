import { z } from 'zod';
import { AdminRoleSchema } from './enums';
import { NonEmptyIdSchema } from './primitives';

const UpsertAdminUserSchema = z
  .object({
    id: NonEmptyIdSchema.optional(),
    email: z.string().trim().email('Correo electrónico inválido').max(160),
    fullName: z.string().trim().min(2, 'Escribe el nombre completo').max(120),
    role: AdminRoleSchema,
    staffMemberId: NonEmptyIdSchema.nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .strict();

const UpsertStaffMemberSchema = z
  .object({
    id: NonEmptyIdSchema.optional(),
    name: z.string().trim().min(2, 'Escribe el nombre de la especialista').max(120),
    roleTitle: z.string().trim().max(120).optional(),
    bio: z.string().max(1000).optional(),
    avatarUrl: z.string().max(2_500_000).nullable().optional(),
    bookingSlug: z.string().trim().max(120).optional(),
    commissionPercent: z.number().min(0).max(100).optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(1000).optional(),
    serviceIds: z.array(NonEmptyIdSchema).max(100).optional(),
  })
  .strict();

export const AdminTeamPostSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('admin_user'),
    data: UpsertAdminUserSchema,
  }),
  z.object({
    kind: z.literal('staff'),
    data: UpsertStaffMemberSchema,
  }),
]);

export const DemoLoginSchema = z.object({
  email: z.string().trim().email(),
});

export const SupabaseLoginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
