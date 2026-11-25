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
  const files = [
    '0001_initial_schema.sql',
    '0002_salon_growth_features.sql',
    '0003_phase1_hardening.sql',
  ];
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
  it('parseDemoDatabase validates the seeded database and rejects corrupted snapshots', () => {
    const seeded = createInitialDemoDatabase();
    const parsed = parseDemoDatabase(seeded);

    expect(parsed.settings.id).toBe('default');
    expect(parsed.staff.length).toBe(seeded.staff.length);
    expect(parsed.bookings.length).toBe(seeded.bookings.length);

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
        bookings: [{ ...seeded.bookings[0], status: 'hacked_status' }],
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

  it('every table, column, view, and RPC in database.types.ts exists in migrations 0001-0003', () => {
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
    ];

    expect(sampleArgKey).toBe('p_hold_id');
    expect(requiredPortMethods).toHaveLength(11);
  });
});
