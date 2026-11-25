import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { checkSourceText } from './check-guardrails.mjs';
import { checkSeedParity } from './check-seed-parity.mjs';

function rulesOf(rel, text) {
  return checkSourceText(rel, text).map((v) => v.rule);
}

test('H1 no-comments: catches dangling comment inside empty catch block', () => {
  const code = [
    'export function send(fn: () => void) {',
    '  try {',
    '    fn();',
    '  } catch {',
    '    // Stream closed',
    '  }',
    '}',
  ].join('\n');

  const violations = checkSourceText('src/app/api/realtime/route.ts', code);
  assert.deepEqual(
    violations.map((v) => v.rule),
    ['no-comments'],
  );
  assert.equal(violations[0].line, 5);
});

test('H1 no-comments: catches block, JSDoc, JSX expression, template-expr, and EOF comments', () => {
  const code = [
    '/** jsdoc */',
    'export function View(host: string) {',
    '  const url = `https://${/* inner */ host}/ok`;',
    '  return <Text>{/* jsx comment */}{url}</Text>;',
    '} // eof',
  ].join('\n');

  const violations = checkSourceText('src/components/View.tsx', code);
  assert.deepEqual(
    violations.map((v) => v.rule),
    ['no-comments', 'no-comments', 'no-comments', 'no-comments'],
  );
});

test('H1 no-comments: allows INVARIANT and triple-slash reference directives, and ignores URLs/regex/templates/JSX text', () => {
  const code = [
    '/// <reference types="node" />',
    '// INVARIANT: regex validates external URL scheme',
    'export function View(host: string) {',
    '  const url = "https://example.com/a//b/*not-a-comment*/";',
    '  const re = /https?:\\/\\/example\\.com\\/\\*fake\\*\\//g;',
    '  const tpl = `https://${host}/path // not a comment ${`nested /* nope */`}`;',
    '  const ratio = 100 / 2 / 5;',
    '  return <Text>Visit https://example.com // not a comment /* nope */ {url} {re.source} {tpl} {ratio}</Text>;',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/components/View.tsx', code), []);
});

test('no-type-escapes: catches any, double cast, and ts-ignore/ts-expect-error directives (even inside INVARIANT)', () => {
  const code = [
    '// @ts-ignore',
    '// INVARIANT: @ts-expect-error',
    'export function f(x: any) {',
    '  return x as unknown as string;',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/sample.ts', code), [
    'no-type-escapes',
    'no-type-escapes',
    'no-type-escapes',
    'no-type-escapes',
  ]);
});

test('no-type-escapes: allows strict unknown narrowing', () => {
  const code = [
    'export function asString(x: unknown): string {',
    '  return typeof x === "string" ? x : "";',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/sample.ts', code), []);
});

test('no-product-effects: catches useEffect and setTimeout in product UI, allows them in src/lib/hooks/', () => {
  const badUi = [
    'import { useEffect } from "react";',
    'export function Panel() {',
    '  useEffect(() => {',
    '    setTimeout(() => {}, 100);',
    '  }, []);',
    '  return null;',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/components/Panel.tsx', badUi), [
    'no-product-effects',
    'no-product-effects',
    'no-product-effects',
  ]);

  assert.deepEqual(rulesOf('src/lib/hooks/usePanel.ts', badUi), []);
});

test('astryx-boundaries: catches raw div/span and inline hex/px, allows Astryx tokens and exempt layout', () => {
  const badUi = [
    'export function Card() {',
    '  return <div style={{ color: "#ff00aa", gap: "12px" }}><span>Hi</span></div>;',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/components/Card.tsx', badUi), [
    'astryx-boundaries',
    'astryx-boundaries',
    'astryx-boundaries',
    'astryx-boundaries',
  ]);

  const cleanUi = [
    'export function Card() {',
    '  return <VStack><Text>var(--color-accent)</Text></VStack>;',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/components/Card.tsx', cleanUi), []);
  assert.deepEqual(rulesOf('src/app/layout.tsx', badUi), []);
});

test('dependency-graph: enforces pure domain boundaries for booking/, public-dto.ts, sanitize.ts, and availability/', () => {
  const forbiddenPaths = [
    'src/lib/booking/state-machine.ts',
    'src/lib/public-dto.ts',
    'src/lib/sanitize.ts',
    'src/lib/availability/engine.ts',
  ];

  const badImports = [
    'import React from "react";',
    'import { NextResponse } from "next/server";',
    'import { createClient } from "@supabase/supabase-js";',
    'import { getSnapshot } from "@/lib/repositories/db";',
    'import { dispatchEmail } from "@/lib/integrations/notifications";',
    'export const x = [React, NextResponse, createClient, getSnapshot, dispatchEmail];',
  ].join('\n');

  for (const rel of forbiddenPaths) {
    assert.deepEqual(rulesOf(rel, badImports), [
      'dependency-graph',
      'dependency-graph',
      'dependency-graph',
      'dependency-graph',
      'dependency-graph',
    ]);
  }

  const cleanDomain = [
    'import { z } from "zod";',
    'import type { BookingStatus } from "@/lib/types";',
    'export const schema = z.string();',
    'export type S = BookingStatus;',
  ].join('\n');

  for (const rel of forbiddenPaths) {
    assert.deepEqual(rulesOf(rel, cleanDomain), []);
  }

  const badComponent = [
    'import { getSnapshot } from "@/lib/repositories/db";',
    'import { requireAdmin } from "@/lib/auth/admin-session";',
    'export const x = [getSnapshot, requireAdmin];',
  ].join('\n');

  assert.deepEqual(rulesOf('src/components/Widget.tsx', badComponent), [
    'dependency-graph',
    'dependency-graph',
  ]);
});

test('H2 admin-auth-required: requires requireAdmin in every exported admin route handler except session/route.ts', () => {
  const missingAuth = [
    'import { getAdminSession } from "@/lib/auth/admin-session";',
    'export async function GET() {',
    '  const session = await getAdminSession();',
    '  return Response.json({ ok: Boolean(session) });',
    '}',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/app/api/admin/overview/route.ts', missingAuth),
    ['admin-auth-required'],
  );

  const partialAuth = [
    'import { requireAdmin } from "@/lib/auth/admin-session";',
    'export async function GET() {',
    '  await requireAdmin();',
    '  return Response.json({ ok: true });',
    '}',
    'export async function POST() {',
    '  return Response.json({ ok: true });',
    '}',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/app/api/admin/bookings/route.ts', partialAuth),
    ['admin-auth-required'],
  );

  const validAuth = [
    'import { requireAdmin } from "@/lib/auth/admin-session";',
    'export async function GET() {',
    '  await requireAdmin(["owner", "admin"]);',
    '  return Response.json({ ok: true });',
    '}',
    'export const POST = async () => {',
    '  await requireAdmin();',
    '  return Response.json({ ok: true });',
    '};',
  ].join('\n');

  assert.deepEqual(rulesOf('src/app/api/admin/bookings/route.ts', validAuth), []);
  assert.deepEqual(rulesOf('src/app/api/admin/session/route.ts', missingAuth), []);
  assert.deepEqual(rulesOf('src/app/api/public/bootstrap/route.ts', missingAuth), []);
});

test('H2 no-demo-bypass-headers: blocks x-*-demo-* headers in src/** except *.test.ts', () => {
  const badWebhook = [
    'export function check(headers: Headers) {',
    '  return headers.get("x-nails-demo-simulate") === "1";',
    '}',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/app/api/webhooks/whatsapp/route.ts', badWebhook),
    ['no-demo-bypass-headers'],
  );

  const badClientHeader = [
    'export const hdrs = { "X-Demo-Bypass": "1" };',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/app/admin/integraciones/page.tsx', badClientHeader),
    ['no-demo-bypass-headers'],
  );

  assert.deepEqual(
    rulesOf('src/app/api/webhooks/whatsapp/route.test.ts', badWebhook),
    [],
  );

  const cleanHeader = [
    'export function check(headers: Headers) {',
    '  return headers.get("x-hub-signature-256");',
    '}',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/app/api/webhooks/whatsapp/route.ts', cleanHeader),
    [],
  );
});

test('H2 no-secret-fallbacks: forbids hardcoded non-empty fallbacks on secret/token/key/password env vars', () => {
  const bad = [
    'export const a = process.env.WHATSAPP_VERIFY_TOKEN || "nails-demo-verify";',
    'export const b = process.env.CRON_SECRET ?? "dev-secret";',
    'export const c = process.env.ADMIN_API_KEY || `fallback`;',
    'export const d = process.env["DB_PASSWORD"] ?? "pass";',
  ].join('\n');

  assert.deepEqual(rulesOf('src/app/api/webhooks/whatsapp/route.ts', bad), [
    'no-secret-fallbacks',
    'no-secret-fallbacks',
    'no-secret-fallbacks',
    'no-secret-fallbacks',
  ]);

  const clean = [
    'export const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";',
    'export const fromEmail = process.env.RESEND_FROM_EMAIL || "studio@example.com";',
    'export const emptyFallback = process.env.WHATSAPP_VERIFY_TOKEN || "";',
    'export const strictSecret = process.env.CRON_SECRET;',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/env.ts', clean), []);
});

test('H2 no-privileged-public-fields: forbids forceConfirmed/source/role in Zod schemas of src/app/api/bookings/route.ts', () => {
  const bad = [
    'import { z } from "zod";',
    'const createBookingSchema = z.object({',
    '  serviceId: z.string(),',
    '  forceConfirmed: z.boolean().optional(),',
    '  source: z.enum(["web", "manual"]).optional(),',
    '  role: z.string().optional(),',
    '});',
    'export { createBookingSchema };',
  ].join('\n');

  assert.deepEqual(rulesOf('src/app/api/bookings/route.ts', bad), [
    'no-privileged-public-fields',
    'no-privileged-public-fields',
    'no-privileged-public-fields',
  ]);

  const clean = [
    'import { z } from "zod";',
    'const createBookingSchema = z.object({',
    '  serviceId: z.string(),',
    '  startAt: z.string(),',
    '});',
    'export function buildPayload(input: z.infer<typeof createBookingSchema>) {',
    '  return { ...input, source: "web", forceConfirmed: false };',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/app/api/bookings/route.ts', clean), []);

  const adminWithAuth = [
    bad,
    'export async function POST() {',
    '  await requireAdmin(["owner"]);',
    '  return Response.json({ ok: true });',
    '}',
  ].join('\n');
  assert.deepEqual(rulesOf('src/app/api/admin/team/route.ts', adminWithAuth), []);
});

test('§8 no-inplace-array-mutation: forbids .sort/.reverse/.splice in src/app/** and src/components/** (except *.test.ts)', () => {
  const bad = [
    'export function reorder(items: number[]) {',
    '  items.sort((a, b) => a - b);',
    '  items.reverse();',
    '  items.splice(0, 1);',
    '  return items;',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/app/page.tsx', bad), [
    'no-inplace-array-mutation',
    'no-inplace-array-mutation',
    'no-inplace-array-mutation',
  ]);
  assert.deepEqual(rulesOf('src/components/List.tsx', bad), [
    'no-inplace-array-mutation',
    'no-inplace-array-mutation',
    'no-inplace-array-mutation',
  ]);
  assert.deepEqual(rulesOf('src/components/List.test.ts', bad), []);
  assert.deepEqual(rulesOf('src/lib/availability/engine.ts', bad), []);

  const clean = [
    'export function reorder(items: number[]) {',
    '  return items.toSorted((a, b) => a - b).toReversed().toSpliced(0, 1);',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/app/page.tsx', clean), []);
});

test('§8 no-raw-csv-join: forbids .join(",") and .join() in non-test files containing text/csv', () => {
  const bad = [
    'export function exportCsv(rows: string[][]) {',
    '  const body = rows.map((r) => r.join(",")).join("\\n");',
    '  const fallback = rows.map((r) => r.join()).join("\\n");',
    '  return new Response(body + fallback, { headers: { "Content-Type": "text/csv; charset=utf-8" } });',
    '}',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/app/api/admin/operations/route.ts', bad).filter((r) => r === 'no-raw-csv-join'),
    ['no-raw-csv-join', 'no-raw-csv-join'],
  );

  assert.deepEqual(rulesOf('src/app/api/admin/operations/route.test.ts', bad), []);

  const cleanCsv = [
    'import { serializeCsvRow } from "@/lib/sanitize";',
    'export function exportCsv(rows: string[][]) {',
    '  const body = rows.map((r) => serializeCsvRow(r)).join("\\n");',
    '  return new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8" } });',
    '}',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/app/api/admin/operations/route.ts', cleanCsv).filter((r) => r === 'no-raw-csv-join'),
    [],
  );

  const cleanNonCsv = [
    'export function listTags(tags: string[]) {',
    '  return tags.join(",");',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/format.ts', cleanNonCsv), []);
});

test('§8 no-snapshot-mutation: catches direct and derived mutations on getSnapshot() variables, allows immutable copies and tests', () => {
  const badDirect = [
    'import { getSnapshot } from "@/lib/repositories/db";',
    'export function mutate(item: unknown) {',
    '  const db = getSnapshot();',
    '  db.settings.name = "Hacked";',
    '  db.bookings.push(item);',
    '  db.services.splice(0, 1);',
    '  db.gallery.sort();',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/use-cases/bad.ts', badDirect), [
    'no-snapshot-mutation',
    'no-snapshot-mutation',
    'no-snapshot-mutation',
    'no-snapshot-mutation',
  ]);

  const badDerived = [
    'import { getSnapshot } from "@/lib/repositories/db";',
    'export function cronRun() {',
    '  const db = getSnapshot();',
    '  const due = db.notifications.filter((n) => n.status === "pending");',
    '  for (const item of due) {',
    '    item.status = "sent";',
    '  }',
    '  const { bookings } = getSnapshot();',
    '  bookings.push({});',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/app/api/cron/reminders/route.ts', badDerived), [
    'no-snapshot-mutation',
    'no-snapshot-mutation',
  ]);

  assert.deepEqual(rulesOf('src/lib/repositories/db.test.ts', badDirect), []);

  const clean = [
    'import { getSnapshot } from "@/lib/repositories/db";',
    'export function readOnly() {',
    '  const db = getSnapshot();',
    '  const settingsCopy = { ...db.settings };',
    '  settingsCopy.name = "Local Copy";',
    '  const sorted = db.gallery.toSorted((a, b) => a.displayOrder - b.displayOrder);',
    '  const mapped = db.notifications.map((n) => ({ ...n, status: "sent" }));',
    '  mapped.push({ status: "sent" });',
    '  return { settingsCopy, sorted, mapped };',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/use-cases/good.ts', clean), []);
});

test('§8 no-internal-dto-in-public-ui: blocks commissionPercent and defaultCommissionPercent in public UI files', () => {
  const publicFiles = [
    'src/app/page.tsx',
    'src/app/reservar/page.tsx',
    'src/app/reservar/[slug]/page.tsx',
    'src/components/LandingView.tsx',
    'src/components/BookingWidget.tsx',
    'src/components/ManageBookingView.tsx',
  ];

  const badPublic = [
    'export function show(staff: { commissionPercent: number }, settings: { defaultCommissionPercent: number }) {',
    '  const viaKey = staff["commissionPercent"];',
    '  return staff.commissionPercent + settings.defaultCommissionPercent + viaKey;',
    '}',
  ].join('\n');

  for (const rel of publicFiles) {
    assert.deepEqual(rulesOf(rel, badPublic), [
      'no-internal-dto-in-public-ui',
      'no-internal-dto-in-public-ui',
      'no-internal-dto-in-public-ui',
      'no-internal-dto-in-public-ui',
      'no-internal-dto-in-public-ui',
    ]);
  }

  const cleanPublic = [
    'import type { PublicStaffDTO, PublicSettingsDTO } from "@/lib/public-dto";',
    'export function show(staff: PublicStaffDTO, settings: PublicSettingsDTO) {',
    '  return `${staff.name} - ${settings.name}`;',
    '}',
  ].join('\n');

  for (const rel of publicFiles) {
    assert.deepEqual(rulesOf(rel, cleanPublic), []);
  }

  assert.deepEqual(rulesOf('src/app/admin/equipo/page.tsx', badPublic), []);
});

test('§8 no-raw-html-interpolation: flags unescaped interpolations in HTML templates of notifications.ts and allows escapeHtml patterns', () => {
  const badEmail = [
    'export function renderEmail(params: { settings: { name: string; address: string }; bodyText: string; manageUrl: string }) {',
    '  const raw = params.manageUrl;',
    '  return `',
    '    <div>',
    '      <h2>${params.settings.name}</h2>',
    '      <p>${params.bodyText.replace(/\\n/g, "<br/>")}</p>',
    '      <a href="${raw}">Link</a>',
    '      <p>${params.settings.address}</p>',
    '    </div>',
    '  `;',
    '}',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/lib/integrations/notifications.ts', badEmail),
    [
      'no-raw-html-interpolation',
      'no-raw-html-interpolation',
      'no-raw-html-interpolation',
      'no-raw-html-interpolation',
    ],
  );

  const cleanEmail = [
    'import { escapeHtml } from "../sanitize";',
    'function formatBodyHtml(text: string): string {',
    '  return escapeHtml(text).replace(/\\n/g, "<br/>");',
    '}',
    'export function renderEmail(params: { settings: { name: string; address: string }; bodyText: string; manageUrl: string; amount: number }) {',
    '  const fromEmail = `${params.settings.name} <onboarding@resend.dev>`;',
    '  const safeName = escapeHtml(params.settings.name);',
    '  const safeAddress = escapeHtml(params.settings.address);',
    '  const safeLines = params.bodyText.split("\\n").map((line) => escapeHtml(line)).join("<br/>");',
    '  const html = `',
    '    <div>',
    '      <h2>${safeName}</h2>',
    '      <p>${escapeHtml(params.bodyText).replace(/\\n/g, "<br/>")}</p>',
    '      <p>${formatBodyHtml(params.bodyText)}</p>',
    '      <p>${safeLines}</p>',
    '      <a href="${escapeHtml(params.manageUrl)}">Ver</a>',
    '      <p>${safeAddress} (${params.amount.toFixed(2)})</p>',
    '    </div>',
    '  `;',
    '  return { fromEmail, html };',
    '}',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/lib/integrations/notifications.ts', cleanEmail),
    [],
  );

  const badConditional = [
    'import { escapeHtml } from "../sanitize";',
    'export function render(a: string, b: string) {',
    '  return `<p>${a || escapeHtml(b)}</p>`;',
    '}',
  ].join('\n');

  assert.deepEqual(
    rulesOf('src/lib/integrations/notifications.ts', badConditional),
    ['no-raw-html-interpolation'],
  );
});

test('A4 no-unsafe-db-cast: forbids "as DemoDatabase" anywhere in src/** and allows Zod parseDemoDatabase', () => {
  const bad = [
    'import type { DemoDatabase } from "../types";',
    'export function load(raw: string) {',
    '  const a = JSON.parse(raw) as DemoDatabase;',
    '  const b = <DemoDatabase>JSON.parse(raw);',
    '  return [a, b];',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/repositories/db.ts', bad), [
    'no-unsafe-db-cast',
    'no-unsafe-db-cast',
  ]);
  assert.deepEqual(rulesOf('src/lib/repositories/db.test.ts', bad), [
    'no-unsafe-db-cast',
    'no-unsafe-db-cast',
  ]);

  const clean = [
    'import { parseDemoDatabase } from "./schema";',
    'export function load(raw: string) {',
    '  return parseDemoDatabase(JSON.parse(raw));',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/repositories/db.ts', clean), []);
});

test('G2 no-direct-math-random: forbids Math.random() in src/lib/** except clock.ts and *.test.ts', () => {
  const bad = [
    'export function makeId() {',
    '  return `${Math.random()}-${Math["random"]()}`;',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/repositories/db.ts', bad), [
    'no-direct-math-random',
    'no-direct-math-random',
  ]);
  assert.deepEqual(rulesOf('src/lib/integrations/notifications.ts', bad), [
    'no-direct-math-random',
    'no-direct-math-random',
  ]);
  assert.deepEqual(rulesOf('src/lib/hooks/useSessionToken.ts', bad), [
    'no-direct-math-random',
    'no-direct-math-random',
  ]);

  assert.deepEqual(rulesOf('src/lib/clock.ts', bad), []);
  assert.deepEqual(rulesOf('src/lib/repositories/db.test.ts', bad), []);

  const clean = [
    'import { randomUUID } from "node:crypto";',
    'export function makeId() {',
    '  return randomUUID();',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/repositories/db.ts', clean), []);
});

test('G2 dependency-graph: src/lib/clock.ts allows node:crypto and blocks React/Next/Supabase/repositories', () => {
  const cleanClock = [
    'import { randomUUID, randomBytes } from "node:crypto";',
    'export function nextId() {',
    '  return randomUUID() + randomBytes(2).toString("hex");',
    '}',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/clock.ts', cleanClock), []);

  const badClock = [
    'import React from "react";',
    'import { NextResponse } from "next/server";',
    'import { createClient } from "@supabase/supabase-js";',
    'import { getSnapshot } from "@/lib/repositories/db";',
    'export const refs = [React, NextResponse, createClient, getSnapshot];',
  ].join('\n');

  assert.deepEqual(rulesOf('src/lib/clock.ts', badClock), [
    'dependency-graph',
    'dependency-graph',
    'dependency-graph',
    'dependency-graph',
  ]);
});

test('M3 checkSeedParity: passes on synced demo-seed.ts + seed.sql and catches slug/price/comment drift', () => {
  const demoSeed = fs.readFileSync('src/lib/demo-seed.ts', 'utf-8');
  const seedSql = fs.readFileSync('supabase/seed.sql', 'utf-8');

  const okRes = checkSeedParity(demoSeed, seedSql);
  assert.equal(okRes.ok, true);
  assert.deepEqual(okRes.diffs, []);
  assert.equal(okRes.counts.staff, 3);
  assert.equal(okRes.counts.services, 9);
  assert.equal(okRes.counts.coupons, 2);

  const driftedSql = seedSql
    .replace("'GIFT500'", "'GIFT999'")
    .replace('35000', '36000');
  const driftRes = checkSeedParity(demoSeed, driftedSql);
  assert.equal(driftRes.ok, false);
  assert.ok(driftRes.diffs.some((d) => d.includes('GIFT500')));
  assert.ok(driftRes.diffs.some((d) => d.includes('rubber')));
});
