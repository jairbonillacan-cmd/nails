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

const ClientAuthMethodSchema = z.enum(['whatsapp_otp', 'email_magic_link', 'google']);

export type ClientAuthMethod = z.infer<typeof ClientAuthMethodSchema>;

export const ClientPortalOtpResponseSchema = z.object({
  ok: z.boolean().optional(),
  phoneE164: z.string().max(20).optional(),
  channel: z.enum(['whatsapp', 'sms', 'email']).optional(),
  demoCode: z.string().regex(/^\d{6}$/).optional(),
  error: z.string().max(300).optional(),
  attemptsRemaining: z.number().int().nonnegative().optional(),
});

export type ClientPortalOtpResponse = z.infer<typeof ClientPortalOtpResponseSchema>;

export const ClientPortalProfileSchema = z.object({
  fullName: z.string().max(200),
  phoneE164: z.string().min(8).max(20),
  email: z.string().max(320).nullable(),
  instagramHandle: z.string().max(120).nullable(),
  birthday: z.string().max(20).nullable(),
  isRegistered: z.boolean(),
  lastServiceSlug: z.string().max(160).nullable().optional(),
  lastServiceName: z.string().max(200).nullable().optional(),
  lastStaffSlug: z.string().max(160).nullable().optional(),
  lastStaffName: z.string().max(200).nullable().optional(),
});

export type ClientPortalProfile = z.infer<typeof ClientPortalProfileSchema>;

export const ClientPortalProfileResponseSchema = z.discriminatedUnion('authenticated', [
  z.object({
    authenticated: z.literal(true),
    authMethod: ClientAuthMethodSchema,
    profile: ClientPortalProfileSchema,
  }),
  z.object({
    authenticated: z.literal(false),
  }),
]);

export const DispatchCampaignSchema = z.object({
  kind: CampaignKindSchema,
  clientId: NonEmptyIdSchema,
  messagePreview: z.string().trim().max(600).optional(),
});
