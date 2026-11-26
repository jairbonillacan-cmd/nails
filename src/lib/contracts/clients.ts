import { z } from 'zod';
import { CampaignKindSchema } from './enums';
import {
  InstagramHandleSchema,
  NonEmptyIdSchema,
  OptionalEmailSchema,
  PhoneInputSchema,
} from './primitives';

export const CreateClientSchema = z.object({
  fullName: z.string().trim().min(2, 'Escribe el nombre completo').max(120),
  phone: PhoneInputSchema.trim().max(30),
  email: OptionalEmailSchema,
  instagramHandle: InstagramHandleSchema,
  birthday: z.string().max(20).optional().nullable(),
  technicalNotes: z.string().max(1000).optional(),
  notes: z.string().max(1000).optional(),
});

export const PatchClientSchema = z.object({
  clientId: NonEmptyIdSchema,
  notes: z.string().max(1000).optional(),
  technicalNotes: z.string().max(1000).optional(),
  birthday: z.string().max(20).optional().nullable(),
  email: OptionalEmailSchema,
  instagramHandle: InstagramHandleSchema,
});

export const ClientPortalOtpActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('request'),
    phone: PhoneInputSchema.max(25),
  }),
  z.object({
    action: z.literal('verify'),
    phone: PhoneInputSchema.max(25),
    code: z.string().trim().regex(/^\d{6}$/, 'El código debe tener 6 dígitos'),
  }),
]);

export const DispatchCampaignSchema = z.object({
  kind: CampaignKindSchema,
  clientId: NonEmptyIdSchema,
  messagePreview: z.string().trim().max(600).optional(),
});
