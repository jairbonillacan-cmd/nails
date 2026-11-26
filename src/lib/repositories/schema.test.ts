import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { createInitialDemoDatabase } from '../demo-seed';
import { DemoDatabaseSchema, parseDemoDatabase } from './schema';
import type { Database } from './database.types';
import type { SalonRepository } from './port';

function readMigrationsSql(): string {
  const dir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  return files.map((file) => fs.readFileSync(path.join(dir, file), 'utf-8')).join('\n');
}

function stripSqlComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

function extractSqlSchema(rawSql: string): {
  tables: Map<string, Set<string>>;
  views: Map<string, Set<string>>;
  functions: Set<string>;
} {
  const sql = stripSqlComments(rawSql);
  const tables = new Map<string, Set<string>>();
  const views = new Map<string, Set<string>>();
  const functions = new Set<string>();

  const createTableRe =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
  let match = createTableRe.exec(sql);
  while (match !== null) {
    const tableName = match[1];
    const body = match[2];
    if (tableName && body) {
      const cols = tables.get(tableName) ?? new Set<string>();
      for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        if (
          /^(CONSTRAINT|PRIMARY|UNIQUE|CHECK|FOREIGN|EXCLUDE|WHERE|\))/i.test(line)
        ) {
          continue;
        }
        const colMatch = /^([a-z][a-z0-9_]*)\s+/i.exec(line);
        if (colMatch?.[1]) {
          cols.add(colMatch[1].toLowerCase());
        }
      }
      tables.set(tableName.toLowerCase(), cols);
    }
    match = createTableRe.exec(sql);
  }

  const alterTableRe = /ALTER\s+TABLE\s+public\.([a-z0-9_]+)([\s\S]*?);/gi;
  let alterMatch = alterTableRe.exec(sql);
  while (alterMatch !== null) {
    const tableName = alterMatch[1]?.toLowerCase();
    const body = alterMatch[2];
    if (tableName && body) {
      const cols = tables.get(tableName) ?? new Set<string>();
      const addColRe = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z][a-z0-9_]*)\s+/gi;
      let colMatch = addColRe.exec(body);
      while (colMatch !== null) {
        if (colMatch[1]) {
          cols.add(colMatch[1].toLowerCase());
        }
        colMatch = addColRe.exec(body);
      }
      tables.set(tableName, cols);
    }
    alterMatch = alterTableRe.exec(sql);
  }

  const viewRe =
    /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+public\.([a-z0-9_]+)[\s\S]*?AS\s+SELECT\s+([\s\S]*?)\s+FROM\s+/gi;
  let viewMatch = viewRe.exec(sql);
  while (viewMatch !== null) {
    const viewName = viewMatch[1]?.toLowerCase();
    const selectList = viewMatch[2];
    if (viewName && selectList) {
      const cols = new Set<string>();
      for (const part of selectList.split(',')) {
        const cleaned = part.trim();
        const aliasMatch = /\bAS\s+([a-z][a-z0-9_]*)$/i.exec(cleaned);
        const identMatch = /([a-z][a-z0-9_]*)$/i.exec(cleaned);
        const col = aliasMatch?.[1] ?? identMatch?.[1];
        if (col) cols.add(col.toLowerCase());
      }
      views.set(viewName, cols);
    }
    viewMatch = viewRe.exec(sql);
  }

  const fnRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi;
  let fnMatch = fnRe.exec(sql);
  while (fnMatch !== null) {
    if (fnMatch[1]) {
      functions.add(fnMatch[1].toLowerCase());
    }
    fnMatch = fnRe.exec(sql);
  }

  return { tables, views, functions };
}

function getPropertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return null;
}

function findPropertyTypeLiteral(
  members: ts.NodeArray<ts.TypeElement>,
  propName: string,
): ts.TypeLiteralNode | null {
  for (const member of members) {
    if (
      ts.isPropertySignature(member) &&
      getPropertyName(member.name) === propName &&
      member.type &&
      ts.isTypeLiteralNode(member.type)
    ) {
      return member.type;
    }
  }
  return null;
}

function extractDatabaseTsSchema(): {
  tables: Map<string, Set<string>>;
  views: Map<string, Set<string>>;
  functions: Set<string>;
} {
  const filePath = path.join(
    process.cwd(),
    'src',
    'lib',
    'repositories',
    'database.types.ts',
  );
  const text = fs.readFileSync(filePath, 'utf-8');
  const sf = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true);

  let dbInterface: ts.InterfaceDeclaration | null = null;
  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === 'Database') {
      dbInterface = stmt;
      break;
    }
  }
  if (!dbInterface) {
    throw new Error('Database interface not found in database.types.ts');
  }

  const publicType = findPropertyTypeLiteral(dbInterface.members, 'public');
  if (!publicType) {
    throw new Error('Database.public not found');
  }

  const tables = new Map<string, Set<string>>();
  const tablesType = findPropertyTypeLiteral(publicType.members, 'Tables');
  if (tablesType) {
    for (const member of tablesType.members) {
      if (
        ts.isPropertySignature(member) &&
        member.type &&
        ts.isTypeLiteralNode(member.type)
      ) {
        const tableName = getPropertyName(member.name);
        const rowType = findPropertyTypeLiteral(member.type.members, 'Row');
        if (tableName && rowType) {
          const cols = new Set<string>();
          for (const colMember of rowType.members) {
            if (ts.isPropertySignature(colMember)) {
              const colName = getPropertyName(colMember.name);
              if (colName) cols.add(colName);
            }
          }
          tables.set(tableName, cols);
        }
      }
    }
  }

  const views = new Map<string, Set<string>>();
  const viewsType = findPropertyTypeLiteral(publicType.members, 'Views');
  if (viewsType) {
    for (const member of viewsType.members) {
      if (
        ts.isPropertySignature(member) &&
        member.type &&
        ts.isTypeLiteralNode(member.type)
      ) {
        const viewName = getPropertyName(member.name);
        const rowType = findPropertyTypeLiteral(member.type.members, 'Row');
        if (viewName && rowType) {
          const cols = new Set<string>();
          for (const colMember of rowType.members) {
            if (ts.isPropertySignature(colMember)) {
              const colName = getPropertyName(colMember.name);
              if (colName) cols.add(colName);
            }
          }
          views.set(viewName, cols);
        }
      }
    }
  }

  const functions = new Set<string>();
  const functionsType = findPropertyTypeLiteral(publicType.members, 'Functions');
  if (functionsType) {
    for (const member of functionsType.members) {
      if (ts.isPropertySignature(member)) {
        const fnName = getPropertyName(member.name);
        if (fnName) functions.add(fnName);
      }
    }
  }

  return { tables, views, functions };
}

describe('DemoDatabase Zod Schema & SQL-to-TS Parity (A4 / M1 / M2 / S5 / S6)', () => {
  it('parseDemoDatabase validates LAIKONA seed, preserves backward compatibility, and rejects invalid snapshots', () => {
    const seeded = createInitialDemoDatabase();
    const parsed = parseDemoDatabase(seeded);

    expect(parsed.settings.id).toBe('default');
    expect(parsed.settings.name).toBe('LAIKONA NAILS');
    expect(parsed.settings.depositClabe).toBe('7229 6901 3959 779869');
    expect(parsed.settings.onboardingCompleted).toBe(false);
    expect(parsed.settings.lockPastBookings).toBe(true);
    expect(parsed.settings.maxActiveBookingsPerClient).toBe(3);
    expect(parsed.settings.privacyPolicyVersion).toBe('2026-11');
    expect(parsed.settings.optimizeContinuousSlots).toBe(false);
    expect(parsed.staff.map((s) => s.name)).toEqual(['Karla', 'Paty', 'Tere']);
    expect(parsed.services).toHaveLength(9);
    expect(parsed.reviews.length).toBeGreaterThanOrEqual(4);
    expect(parsed.loyaltyPrograms?.length).toBe(1);
    expect(parsed.loyaltyStamps?.filter((s) => s.clientId === 'client-sofia')).toHaveLength(6);
    expect(parsed.paymentSplits?.length).toBeGreaterThanOrEqual(4);
    expect(parsed.recurringBlocks?.length).toBe(1);
    expect(parsed.consents?.length).toBeGreaterThanOrEqual(2);
    expect(parsed.auditLogs?.length).toBeGreaterThanOrEqual(1);
    expect(parsed.settings.noShowDepositThreshold).toBe(2);
    expect(parsed.servicePackages?.length).toBe(2);
    expect(parsed.clientPackages?.length).toBe(1);
    expect(parsed.clientPackages?.[0]?.clientId).toBe('client-sofia');
    expect(parsed.schedules[0]?.rules[0]?.fixedStartTimes).toEqual([
      '10:00',
      '13:30',
      '16:30',
    ]);
    expect(parsed.schedules[2]?.rules[0]?.fixedStartTimes).toEqual([
      '14:00',
      '16:00',
      '18:00',
    ]);
    expect(parsed.bookings.length).toBe(seeded.bookings.length);
    expect(parsed.bookings[0]?.proofDeliveryMethod).toBe('web_upload');
    expect(parsed.bookings[0]?.clientInstagram).toBe('@sofia.ramirez.pue');
    expect(parsed.settings.retentionNoticeEmail).toBe('hola@laikonanails.mx');
    expect(parsed.settings.whatsappMonthlyQuota).toBe(500);
    expect(parsed.mediaAssets?.length).toBeGreaterThanOrEqual(1);
    expect(parsed.whatsappTemplates?.length).toBe(6);
    expect(parsed.whatsappTemplates?.every((t) => t.category === 'UTILITY' && t.languageCode === 'es_MX')).toBe(true);
    expect(parsed.whatsappMonthlyUsage?.length).toBe(1);
    expect(parsed.webhookEvents).toEqual([]);

    const {
      city: _city,
      instagramUrl: _instagramUrl,
      sisterStudioHandle: _sister,
      depositBeneficiary: _beneficiary,
      depositAmountCents: _depAmt,
      serviceMode: _mode,
      businessType: _btype,
      teamSizeTier: _tier,
      onboardingCompleted: _onb,
      soundAlertsEnabled: _sound,
      lockPastBookings: _lpb,
      maxActiveBookingsPerClient: _maxAct,
      privacyPolicyVersion: _ppv,
      noShowDepositThreshold: _nsdt,
      ownerPinHash: _oph,
      ownerPinEnabled: _ope,
      hasOwnerPin: _hop,
      retentionNoticeEmail: _rne,
      whatsappMonthlyQuota: _wmq,
      ...legacySettings
    } = seeded.settings;

    const {
      paymentSplits: _ps,
      recurringBlocks: _rb,
      loyaltyPrograms: _lp,
      loyaltyStamps: _ls,
      couponRedemptions: _cr,
      consents: _cn,
      auditLogs: _al,
      servicePackages: _spkgs,
      clientPackages: _cpkgs,
      campaignDispatches: _cdisp,
      mediaAssets: _ma,
      whatsappTemplates: _wt,
      whatsappMonthlyUsage: _wmu,
      webhookEvents: _we,
      ...legacyRoot
    } = seeded;

    const legacySnapshot = {
      ...legacyRoot,
      settings: legacySettings,
      services: seeded.services.map(({ isStartingPrice: _sp, ...rest }) => rest),
      schedules: seeded.schedules.map((sched) => ({
        ...sched,
        rules: sched.rules.map(({ fixedStartTimes: _fx, ...rest }) => rest),
      })),
      clients: seeded.clients.map(({ instagramHandle: _ig, ...rest }) => rest),
      bookings: seeded.bookings.map(
        ({
          extraServiceIds: _ex,
          clientInstagram: _cig,
          customDurationMinutes: _cd,
          customPriceCents: _cp,
          proofDeliveryMethod: _pdm,
          ...rest
        }) => rest,
      ),
    };
    const parsedLegacy = parseDemoDatabase(legacySnapshot);
    expect(parsedLegacy.paymentSplits).toEqual([]);
    expect(parsedLegacy.recurringBlocks).toEqual([]);
    expect(parsedLegacy.loyaltyPrograms).toEqual([]);
    expect(parsedLegacy.loyaltyStamps).toEqual([]);
    expect(parsedLegacy.couponRedemptions).toEqual([]);
    expect(parsedLegacy.consents).toEqual([]);
    expect(parsedLegacy.auditLogs).toEqual([]);
    expect(parsedLegacy.servicePackages).toEqual([]);
    expect(parsedLegacy.clientPackages).toEqual([]);
    expect(parsedLegacy.campaignDispatches).toEqual([]);
    expect(parsedLegacy.mediaAssets).toEqual([]);
    expect(parsedLegacy.whatsappTemplates).toEqual([]);
    expect(parsedLegacy.whatsappMonthlyUsage).toEqual([]);
    expect(parsedLegacy.webhookEvents).toEqual([]);

    expect(DemoDatabaseSchema.safeParse(null).success).toBe(false);
    expect(DemoDatabaseSchema.safeParse({}).success).toBe(false);
    expect(
      DemoDatabaseSchema.safeParse({
        ...seeded,
        settings: { ...seeded.settings, slotIntervalMinutes: 20 },
      }).success,
    ).toBe(false);
    expect(
      DemoDatabaseSchema.safeParse({
        ...seeded,
        settings: { ...seeded.settings, serviceMode: 'spaceship' },
      }).success,
    ).toBe(false);
    expect(
      DemoDatabaseSchema.safeParse({
        ...seeded,
        schedules: [
          {
            ...seeded.schedules[0],
            rules: [
              {
                ...seeded.schedules[0]?.rules[0],
                fixedStartTimes: ['99:99'],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      DemoDatabaseSchema.safeParse({
        ...seeded,
        bookings: [{ ...seeded.bookings[0], status: 'hacked_status' }],
      }).success,
    ).toBe(false);
    expect(
      DemoDatabaseSchema.safeParse({
        ...seeded,
        bookings: [{ ...seeded.bookings[0], proofDeliveryMethod: 'fax' }],
      }).success,
    ).toBe(false);
    expect(
      DemoDatabaseSchema.safeParse({
        ...seeded,
        bookings: [{ ...seeded.bookings[0], customPriceCents: -100 }],
      }).success,
    ).toBe(false);
    expect(() =>
      parseDemoDatabase({
        ...seeded,
        reviews: [
          {
            id: 'rev-bad',
            bookingId: 'bk-1',
            clientId: null,
            staffId: null,
            rating: 99,
            comment: '',
            clickedGoogleReview: false,
            createdAt: '2026-12-01T00:00:00.000Z',
          },
        ],
      }),
    ).toThrow();
  });

  it('every table, column, view, and RPC in database.types.ts exists in SQL migrations', () => {
    const rawSql = readMigrationsSql();
    const sqlSchema = extractSqlSchema(rawSql);
    const tsSchema = extractDatabaseTsSchema();

    expect(tsSchema.tables.size).toBeGreaterThanOrEqual(28);
    for (const [tableName, tsCols] of tsSchema.tables.entries()) {
      const sqlCols = sqlSchema.tables.get(tableName);
      expect(sqlCols, `Table "${tableName}" missing from SQL migrations`).toBeDefined();
      for (const col of tsCols) {
        expect(
          sqlCols?.has(col),
          `Column "${tableName}.${col}" in database.types.ts missing from SQL migrations`,
        ).toBe(true);
      }
    }

    expect(sqlSchema.tables.get('availability_rules')?.has('fixed_start_times')).toBe(true);
    expect(sqlSchema.tables.get('services')?.has('is_starting_price')).toBe(true);
    expect(sqlSchema.tables.get('clients')?.has('instagram_handle')).toBe(true);
    for (const bookingCol of [
      'extra_service_ids',
      'client_instagram',
      'custom_duration_minutes',
      'custom_price_cents',
      'internal_notes',
      'proof_delivery_method',
    ]) {
      expect(sqlSchema.tables.get('bookings')?.has(bookingCol)).toBe(true);
    }
    for (const settingsCol of [
      'instagram_handle',
      'sister_studio_handle',
      'deposit_bank_name',
      'deposit_beneficiary',
      'deposit_clabe',
      'deposit_amount_cents',
      'service_mode',
      'business_type',
      'team_size_tier',
      'onboarding_completed',
      'sound_alerts_enabled',
    ]) {
      expect(sqlSchema.tables.get('salon_settings')?.has(settingsCol)).toBe(true);
    }

    expect(tsSchema.views.has('public_busy_overrides')).toBe(true);
    for (const [viewName, tsCols] of tsSchema.views.entries()) {
      const sqlCols = sqlSchema.views.get(viewName);
      expect(sqlCols, `View "${viewName}" missing from SQL migrations`).toBeDefined();
      for (const col of tsCols) {
        expect(
          sqlCols?.has(col),
          `View column "${viewName}.${col}" missing from SQL migrations`,
        ).toBe(true);
      }
    }

    const busyOverridesCols = tsSchema.views.get('public_busy_overrides');
    expect(busyOverridesCols?.has('reason')).toBe(false);

    const busyIntervalCols = tsSchema.tables.get('public_busy_intervals');
    expect(busyIntervalCols?.has('staff_id')).toBe(true);
    expect(busyIntervalCols?.has('occupied_range')).toBe(true);
    expect(busyIntervalCols?.has('slot_date')).toBe(true);
    for (const piiCol of [
      'client_id',
      'client_name',
      'full_name',
      'phone_e164',
      'email',
      'booking_code',
      'manage_token',
      'session_token',
    ]) {
      expect(busyIntervalCols?.has(piiCol)).toBe(false);
    }

    expect(tsSchema.functions.has('create_booking_atomic')).toBe(true);
    for (const fnName of tsSchema.functions) {
      expect(
        sqlSchema.functions.has(fnName),
        `Function "${fnName}" in database.types.ts missing from SQL migrations`,
      ).toBe(true);
    }

    const migration0003 = fs.readFileSync(
      path.join(process.cwd(), 'supabase', 'migrations', '0003_phase1_hardening.sql'),
      'utf-8',
    );
    expect(migration0003).toContain('EXCLUDE USING gist');
    expect(migration0003).toContain('held_range WITH &&');
    expect(migration0003).toContain("SET search_path = ''");
    expect(migration0003).toContain('DROP POLICY IF EXISTS "public_read_overrides"');
    expect(migration0003).toContain('ADD TABLE public.public_busy_intervals');
    expect(migration0003).toContain('HOLD_OWNERSHIP_MISMATCH');
    expect(migration0003).toContain('held_range @> v_occupied_range');
    expect(migration0003).toContain('SLOT_HELD_BY_OTHER_SESSION');
    expect(migration0003).toContain('COUPON_EXPIRED');
    expect(migration0003).toContain('COUPON_MIN_SUBTOTAL');
    expect(migration0003).toContain('REVOKE ALL ON FUNCTION public.create_booking_atomic');

    const migration0008 = fs.readFileSync(
      path.join(
        process.cwd(),
        'supabase',
        'migrations',
        '0008_production_r2_whatsapp_retention.sql',
      ),
      'utf-8',
    );
    expect(migration0008).toContain('public.media_assets');
    expect(migration0008).toContain('public.whatsapp_templates');
    expect(migration0008).toContain('public.whatsapp_monthly_usage');
    expect(migration0008).toContain('public.webhook_events');
    expect(migration0008).toContain('public.increment_whatsapp_usage');
    expect(migration0008).toContain("SET search_path = ''");
    expect(migration0008).toContain('media_retention_warned');
    expect(migration0008).toContain('media_retention_purged');
    expect(tsSchema.functions.has('increment_whatsapp_usage')).toBe(true);
    expect(sqlSchema.tables.get('salon_settings')?.has('retention_notice_email')).toBe(true);
    expect(sqlSchema.tables.get('salon_settings')?.has('whatsapp_monthly_quota')).toBe(true);
  });

  it('keeps Database and SalonRepository type contracts compile-time valid', () => {
    type AtomicArgs = Database['public']['Functions']['create_booking_atomic']['Args'];
    type PortKeys = keyof SalonRepository;

    const sampleArgKey: keyof AtomicArgs = 'p_hold_id';
    const requiredPortMethods: readonly PortKeys[] = [
      'getSnapshot',
      'getPublicBootstrap',
      'createOrRefreshSlotHold',
      'createBookingAtomic',
      'updateBookingStatus',
      'manageClientBookingAction',
      'processDueScheduledNotifications',
      'enqueueOutboxEvent',
      'dequeueOutboxEvents',
      'ackOutboxEvent',
      'failOutboxEvent',
      'registerMediaAsset',
      'getMediaAccessOwner',
      'listMediaAssetsForRetention',
      'markMediaRetentionWarned',
      'markMediaAssetPurged',
      'getWhatsAppTemplates',
      'getWhatsAppMonthlyUsage',
      'incrementWhatsAppMonthlyUsage',
      'claimWebhookEventIdempotent',
      'cleanupExpiredSlotHolds',
    ];

    expect(sampleArgKey).toBe('p_hold_id');
    expect(requiredPortMethods).toHaveLength(21);
  });
});
