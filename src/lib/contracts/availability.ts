import { z } from 'zod';
import { DayOfWeekSchema, RecurringFrequencySchema } from './enums';
import { DateKeySchema, NonEmptyIdSchema, TimeHHMMSchema } from './primitives';

const AvailabilityRuleSchema = z
  .object({
    id: NonEmptyIdSchema,
    dayOfWeek: DayOfWeekSchema,
    startTime: TimeHHMMSchema,
    endTime: TimeHHMMSchema,
    fixedStartTimes: z.array(TimeHHMMSchema).max(24).optional(),
  })
  .refine((rule) => rule.startTime < rule.endTime, {
    message: 'La hora de inicio debe ser menor a la hora de fin.',
  })
  .refine(
    (rule) =>
      !rule.fixedStartTimes ||
      rule.fixedStartTimes.every((t) => t >= rule.startTime && t < rule.endTime),
    {
      message: 'Cada horario fijo debe estar dentro de la ventana laboral.',
    },
  );

export const PutScheduleSchema = z.object({
  staffId: NonEmptyIdSchema,
  rules: z.array(AvailabilityRuleSchema).max(50),
});

export const PostOverrideSchema = z.object({
  staffId: NonEmptyIdSchema,
  overrideDate: DateKeySchema,
  isUnavailable: z.boolean(),
  startTime: TimeHHMMSchema.nullable().default(null),
  endTime: TimeHHMMSchema.nullable().default(null),
  reason: z.string().max(240).default(''),
  publicNote: z.string().trim().max(240).optional(),
  redirectStaffId: NonEmptyIdSchema.nullable().optional(),
});

export const PostOverrideRangeSchema = z
  .object({
    kind: z.literal('override_range'),
    staffId: NonEmptyIdSchema,
    startDate: DateKeySchema,
    endDate: DateKeySchema,
    isClosed: z.boolean().optional(),
    isUnavailable: z.boolean().optional(),
    startTime: TimeHHMMSchema.nullable().default(null),
    endTime: TimeHHMMSchema.nullable().default(null),
    reason: z.string().max(240).default(''),
    publicNote: z.string().trim().max(240).optional(),
    redirectStaffId: NonEmptyIdSchema.nullable().optional(),
  })
  .refine(
    (body) => {
      const closed = body.isClosed ?? body.isUnavailable ?? true;
      if (closed) return true;
      return Boolean(body.startTime && body.endTime && body.startTime < body.endTime);
    },
    { message: 'Define hora de inicio y fin válidas cuando el día no está cerrado.' },
  );

export const PreloadHolidaysSchema = z.object({
  kind: z.literal('preload_mx_holidays'),
  year: z.number().int().min(2024).max(2100),
  staffId: NonEmptyIdSchema,
  publicNote: z.string().trim().max(240).optional(),
  redirectStaffId: NonEmptyIdSchema.nullable().optional(),
});

export const PostRecurringBlockSchema = z
  .object({
    kind: z.literal('recurring_block'),
    id: NonEmptyIdSchema.optional(),
    staffId: NonEmptyIdSchema,
    reason: z.string().trim().min(1, 'Escribe un motivo').max(240),
    frequency: RecurringFrequencySchema,
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
    dayOfMonth: z.number().int().min(1).max(31).nullable().default(null),
    startTime: TimeHHMMSchema,
    endTime: TimeHHMMSchema,
    untilDate: DateKeySchema.nullable().default(null),
    isActive: z.boolean().default(true),
  })
  .refine((block) => block.startTime < block.endTime, {
    message: 'La hora de inicio debe ser menor a la hora de fin.',
  })
  .refine(
    (block) =>
      block.frequency === 'weekly'
        ? block.weekdays.length > 0
        : block.dayOfMonth !== null,
    {
      message: 'Define al menos un día de la semana o el día del mes.',
    },
  );

export const ToggleRecurringBlockSchema = z.object({
  kind: z.literal('recurring_block_toggle'),
  id: NonEmptyIdSchema,
  isActive: z.boolean(),
});

export const PublicAvailabilityQuerySchema = z.object({
  mode: z.enum(['range', 'quick', 'quick_search']).default('range'),
  serviceId: z.string().trim().optional(),
  staffId: z.string().trim().nullable().optional(),
  startDate: DateKeySchema.optional(),
  days: z.number().int().min(1).max(90).optional(),
  limit: z.number().int().min(1).max(30).optional(),
  addonIds: z.array(NonEmptyIdSchema).max(20).default([]),
  extraServiceIds: z.array(NonEmptyIdSchema).max(8).default([]),
  manageToken: z.string().trim().optional(),
  offer: z.string().trim().max(120).optional(),
});
