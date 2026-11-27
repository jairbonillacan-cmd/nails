import {
  isMetricDateKey,
  isMetricPeriod,
  isMetricReportPeriod,
  type MetricPeriod,
  type MetricReportPeriod,
} from './metrics/periods';

type AdminSearchParamsLike = {
  get(name: string): string | null;
};

export type AdminSearchParamsInput =
  | AdminSearchParamsLike
  | URLSearchParams
  | Readonly<Record<string, string | string[] | null | undefined>>
  | string
  | null
  | undefined;

type AgendaViewParam = 'day' | 'week' | 'list';
type AgendaStatusParam =
  | 'all'
  | 'upcoming'
  | 'pending'
  | 'uncollected'
  | 'past'
  | 'completed'
  | 'canceled';
type AgendaTabParam = 'upcoming' | 'pending' | 'past' | 'canceled' | 'waitlist';

export interface AgendaLinkParams {
  view?: AgendaViewParam;
  date?: string;
  staff?: string;
  status?: AgendaStatusParam;
  q?: string;
  tab?: AgendaTabParam;
  new?: boolean;
  collect?: string;
  clientName?: string;
  clientPhone?: string;
  clientInstagram?: string;
  staffId?: string;
  serviceId?: string;
  panel?: 'waitlist';
}

type CajaTabParam =
  | 'resumen'
  | 'anticipos'
  | 'comisiones'
  | 'promos'
  | 'sin-cobrar'
  | 'cupones'
  | 'paquetes';
type CajaSubParam = 'coupons' | 'packages';
type CajaMethodParam = 'cash' | 'card' | 'transfer';

export interface CajaLinkParams {
  tab?: CajaTabParam;
  sub?: CajaSubParam;
  period?: MetricPeriod;
  from?: string;
  to?: string;
  staff?: string;
  method?: CajaMethodParam;
  quickSaleProductId?: string;
  q?: string;
}

type ClientasTabParam = 'directorio' | 'retencion' | 'paquetes';
type ClientasFilterParam =
  | 'all'
  | 'vip'
  | 'package'
  | 'near_reward'
  | 'birthday'
  | 'alerts';

export interface ClientasLinkParams {
  tab?: ClientasTabParam;
  q?: string;
  clientId?: string;
  filter?: ClientasFilterParam;
}

type WhatsAppTabParam = 'mensajes' | 'recordatorios' | 'conexion';
export type WhatsAppFilterParam = 'all' | 'unread' | 'window_open' | 'failed';

export interface WhatsAppLinkParams {
  tab?: WhatsAppTabParam;
  phone?: string;
  bookingId?: string;
  clientId?: string;
  filter?: WhatsAppFilterParam;
  q?: string;
}

export type HorariosTabParam = 'horarios' | 'excepciones' | 'bloqueos' | 'diagnostico';

export interface HorariosLinkParams {
  staff?: string;
  tab?: HorariosTabParam;
  date?: string;
  serviceId?: string;
}

type ServiciosTabParam = 'servicios' | 'extras' | 'categorias';

export interface ServiciosLinkParams {
  id?: string;
  tab?: ServiciosTabParam;
  q?: string;
}

type EquipoTabParam = 'equipo' | 'accesos';

export interface EquipoLinkParams {
  staffId?: string;
  tab?: EquipoTabParam;
}

type InventarioFilterParam = 'all' | 'low' | 'retail' | 'supplies';

export interface InventarioLinkParams {
  filter?: InventarioFilterParam;
  itemId?: string;
  q?: string;
}

export interface ReportesLinkParams {
  period?: MetricReportPeriod;
  from?: string;
  to?: string;
  staff?: string;
}

export interface MarcaLinkParams {
  tab?: string;
  focus?: string;
}

export interface IntegracionesLinkParams {
  tab?: string;
  focus?: string;
  section?: string;
  google?: 'connected' | 'error';
  hash?: string;
}

export interface OnboardingLinkParams {
  step?: string;
}

export interface ResumenLinkParams {
  period?: MetricPeriod;
}

function hasGetMethod(value: unknown): value is AdminSearchParamsLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'get' in value &&
    typeof (value as { get?: unknown }).get === 'function'
  );
}

function splitHrefAndHash(raw: string): { query: string; hash: string | null } {
  const hashIdx = raw.indexOf('#');
  const hash = hashIdx >= 0 ? raw.slice(hashIdx + 1).trim() || null : null;
  const beforeHash = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw;
  const qIdx = beforeHash.indexOf('?');
  if (qIdx >= 0) {
    return { query: beforeHash.slice(qIdx + 1), hash };
  }
  if (beforeHash.includes('=') && !beforeHash.startsWith('/')) {
    return { query: beforeHash, hash };
  }
  return { query: '', hash };
}

function toParamReader(input: AdminSearchParamsInput): {
  get: (key: string) => string | null;
  hash: string | null;
} {
  if (!input) {
    return { get: () => null, hash: null };
  }
  if (typeof input === 'string') {
    const { query, hash } = splitHrefAndHash(input);
    const params = new URLSearchParams(query);
    return { get: (key) => params.get(key), hash };
  }
  if (hasGetMethod(input)) {
    return { get: (key) => input.get(key), hash: null };
  }
  return {
    get: (key) => {
      const val = input[key];
      if (Array.isArray(val)) return val[0] ?? null;
      return typeof val === 'string' ? val : null;
    },
    hash: null,
  };
}

function cleanString(value: string | null | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildHref(basePath: string, params: URLSearchParams, hash?: string): string {
  const qs = params.toString();
  const cleanHash = cleanString(hash)?.replace(/^#+/, '');
  const withQuery = qs ? `${basePath}?${qs}` : basePath;
  return cleanHash ? `${withQuery}#${cleanHash}` : withQuery;
}

function pickOne<T extends string>(
  raw: string | null | undefined,
  allowed: ReadonlySet<T>,
): T | undefined {
  const cleaned = cleanString(raw);
  return cleaned && allowed.has(cleaned as T) ? (cleaned as T) : undefined;
}

const AGENDA_VIEWS = new Set<AgendaViewParam>(['day', 'week', 'list']);
const AGENDA_STATUSES = new Set<AgendaStatusParam>([
  'all',
  'upcoming',
  'pending',
  'uncollected',
  'past',
  'completed',
  'canceled',
]);
const AGENDA_TABS = new Set<AgendaTabParam>([
  'upcoming',
  'pending',
  'past',
  'canceled',
  'waitlist',
]);

export function agendaHref(params?: AgendaLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    if (params.view) qs.set('view', params.view);
    const date = cleanString(params.date);
    if (date && isMetricDateKey(date)) qs.set('date', date);
    const staff = cleanString(params.staff);
    if (staff) qs.set('staff', staff);
    if (params.status) qs.set('status', params.status);
    const q = cleanString(params.q);
    if (q) qs.set('q', q);
    if (params.tab) qs.set('tab', params.tab);
    if (params.new) qs.set('new', '1');
    const collect = cleanString(params.collect);
    if (collect) qs.set('collect', collect);
    const clientName = cleanString(params.clientName);
    if (clientName) qs.set('clientName', clientName);
    const clientPhone = cleanString(params.clientPhone);
    if (clientPhone) qs.set('clientPhone', clientPhone);
    const clientInstagram = cleanString(params.clientInstagram);
    if (clientInstagram) qs.set('clientInstagram', clientInstagram);
    const staffId = cleanString(params.staffId);
    if (staffId) qs.set('staffId', staffId);
    const serviceId = cleanString(params.serviceId);
    if (serviceId) qs.set('serviceId', serviceId);
    if (params.panel) qs.set('panel', params.panel);
  }
  return buildHref('/admin/citas', qs);
}

export function parseAgendaParams(input: AdminSearchParamsInput): AgendaLinkParams {
  const reader = toParamReader(input);
  const out: AgendaLinkParams = {};
  const view = pickOne(reader.get('view'), AGENDA_VIEWS);
  if (view) out.view = view;
  const date = cleanString(reader.get('date'));
  if (date && isMetricDateKey(date)) out.date = date;
  const staff = cleanString(reader.get('staff'));
  if (staff) out.staff = staff;
  const status = pickOne(reader.get('status'), AGENDA_STATUSES);
  if (status) out.status = status;
  const q = cleanString(reader.get('q'));
  if (q) out.q = q;
  const tab = pickOne(reader.get('tab'), AGENDA_TABS);
  if (tab) out.tab = tab;
  const rawNew = cleanString(reader.get('new'));
  if (rawNew === '1' || rawNew === 'true') out.new = true;
  const collect = cleanString(reader.get('collect'));
  if (collect) out.collect = collect;
  const clientName = cleanString(reader.get('clientName'));
  if (clientName) out.clientName = clientName;
  const clientPhone = cleanString(reader.get('clientPhone'));
  if (clientPhone) out.clientPhone = clientPhone;
  const clientInstagram = cleanString(reader.get('clientInstagram'));
  if (clientInstagram) out.clientInstagram = clientInstagram;
  const staffId = cleanString(reader.get('staffId'));
  if (staffId) out.staffId = staffId;
  const serviceId = cleanString(reader.get('serviceId'));
  if (serviceId) out.serviceId = serviceId;
  const panel = cleanString(reader.get('panel'));
  if (panel === 'waitlist') out.panel = 'waitlist';
  return out;
}

const CAJA_METHODS = new Set<CajaMethodParam>(['cash', 'card', 'transfer']);

function normalizeCajaTab(raw: string | null | undefined): CajaTabParam | undefined {
  const cleaned = cleanString(raw);
  if (!cleaned) return undefined;
  if (cleaned === 'resumen' || cleaned === 'summary') return 'resumen';
  if (cleaned === 'anticipos' || cleaned === 'deposits' || cleaned === 'receivable') {
    return 'anticipos';
  }
  if (cleaned === 'comisiones' || cleaned === 'commissions') return 'comisiones';
  if (cleaned === 'promos') return 'promos';
  if (cleaned === 'sin-cobrar' || cleaned === 'uncollected') return 'sin-cobrar';
  if (cleaned === 'cupones' || cleaned === 'coupons') return 'cupones';
  if (cleaned === 'paquetes' || cleaned === 'packages') return 'paquetes';
  return undefined;
}

function normalizeCajaSub(raw: string | null | undefined): CajaSubParam | undefined {
  const cleaned = cleanString(raw);
  if (cleaned === 'packages' || cleaned === 'paquetes') return 'packages';
  if (cleaned === 'coupons' || cleaned === 'cupones') return 'coupons';
  return undefined;
}

export function cajaHref(params?: CajaLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    if (params.tab) qs.set('tab', params.tab);
    if (params.sub) qs.set('sub', params.sub);
    if (params.period) qs.set('period', params.period);
    const from = cleanString(params.from);
    if (from && isMetricDateKey(from)) qs.set('from', from);
    const to = cleanString(params.to);
    if (to && isMetricDateKey(to)) qs.set('to', to);
    const staff = cleanString(params.staff);
    if (staff) qs.set('staff', staff);
    if (params.method) qs.set('method', params.method);
    const quickSaleProductId = cleanString(params.quickSaleProductId);
    if (quickSaleProductId) qs.set('quickSaleProductId', quickSaleProductId);
    const q = cleanString(params.q);
    if (q) qs.set('q', q);
  }
  return buildHref('/admin/caja', qs);
}

export function parseCajaParams(input: AdminSearchParamsInput): CajaLinkParams {
  const reader = toParamReader(input);
  const out: CajaLinkParams = {};
  const tab = normalizeCajaTab(reader.get('tab'));
  if (tab) out.tab = tab;
  const sub = normalizeCajaSub(reader.get('sub'));
  if (sub) out.sub = sub;
  const period = cleanString(reader.get('period'));
  if (isMetricPeriod(period)) out.period = period;
  const from = cleanString(reader.get('from'));
  if (from && isMetricDateKey(from)) out.from = from;
  const to = cleanString(reader.get('to'));
  if (to && isMetricDateKey(to)) out.to = to;
  const staff = cleanString(reader.get('staff'));
  if (staff) out.staff = staff;
  const method = pickOne(reader.get('method'), CAJA_METHODS);
  if (method) out.method = method;
  const quickSaleProductId = cleanString(reader.get('quickSaleProductId'));
  if (quickSaleProductId) out.quickSaleProductId = quickSaleProductId;
  const q = cleanString(reader.get('q'));
  if (q) out.q = q;
  return out;
}

const CLIENTAS_FILTERS = new Set<ClientasFilterParam>([
  'all',
  'vip',
  'package',
  'near_reward',
  'birthday',
  'alerts',
]);

function normalizeClientasTab(raw: string | null | undefined): ClientasTabParam | undefined {
  const cleaned = cleanString(raw);
  if (!cleaned) return undefined;
  if (cleaned === 'directorio' || cleaned === 'directory') return 'directorio';
  if (cleaned === 'retencion' || cleaned === 'retention') return 'retencion';
  if (cleaned === 'paquetes' || cleaned === 'packages' || cleaned === 'lealtad') {
    return 'paquetes';
  }
  return undefined;
}

export function clientasHref(params?: ClientasLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    if (params.tab) qs.set('tab', params.tab);
    const q = cleanString(params.q);
    if (q) qs.set('q', q);
    const clientId = cleanString(params.clientId);
    if (clientId) qs.set('clientId', clientId);
    if (params.filter) qs.set('filter', params.filter);
  }
  return buildHref('/admin/clientas', qs);
}

export function parseClientasParams(input: AdminSearchParamsInput): ClientasLinkParams {
  const reader = toParamReader(input);
  const out: ClientasLinkParams = {};
  const tab = normalizeClientasTab(reader.get('tab'));
  if (tab) out.tab = tab;
  const q = cleanString(reader.get('q'));
  if (q) out.q = q;
  const clientId = cleanString(reader.get('clientId'));
  if (clientId) out.clientId = clientId;
  const filter = pickOne(reader.get('filter'), CLIENTAS_FILTERS);
  if (filter) out.filter = filter;
  return out;
}

const WHATSAPP_TABS = new Set<WhatsAppTabParam>(['mensajes', 'recordatorios', 'conexion']);
const WHATSAPP_FILTERS = new Set<WhatsAppFilterParam>([
  'all',
  'unread',
  'window_open',
  'failed',
]);

export function whatsappHref(params?: WhatsAppLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    if (params.tab) qs.set('tab', params.tab);
    const phone = cleanString(params.phone);
    if (phone) qs.set('phone', phone);
    const bookingId = cleanString(params.bookingId);
    if (bookingId) qs.set('bookingId', bookingId);
    const clientId = cleanString(params.clientId);
    if (clientId) qs.set('clientId', clientId);
    if (params.filter) qs.set('filter', params.filter);
    const q = cleanString(params.q);
    if (q) qs.set('q', q);
  }
  return buildHref('/admin/whatsapp', qs);
}

export function parseWhatsAppParams(input: AdminSearchParamsInput): WhatsAppLinkParams {
  const reader = toParamReader(input);
  const out: WhatsAppLinkParams = {};
  const tab = pickOne(reader.get('tab'), WHATSAPP_TABS);
  if (tab) out.tab = tab;
  const phone = cleanString(reader.get('phone'));
  if (phone) out.phone = phone;
  const bookingId = cleanString(reader.get('bookingId'));
  if (bookingId) out.bookingId = bookingId;
  const clientId = cleanString(reader.get('clientId'));
  if (clientId) out.clientId = clientId;
  const filter = pickOne(reader.get('filter'), WHATSAPP_FILTERS);
  if (filter) out.filter = filter;
  const q = cleanString(reader.get('q'));
  if (q) out.q = q;
  return out;
}

const HORARIOS_TABS = new Set<HorariosTabParam>([
  'horarios',
  'excepciones',
  'bloqueos',
  'diagnostico',
]);

export function horariosHref(params?: HorariosLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    const staff = cleanString(params.staff);
    if (staff) qs.set('staff', staff);
    if (params.tab) qs.set('tab', params.tab);
    const date = cleanString(params.date);
    if (date && isMetricDateKey(date)) qs.set('date', date);
    const serviceId = cleanString(params.serviceId);
    if (serviceId) qs.set('serviceId', serviceId);
  }
  return buildHref('/admin/disponibilidad', qs);
}

export function parseHorariosParams(input: AdminSearchParamsInput): HorariosLinkParams {
  const reader = toParamReader(input);
  const out: HorariosLinkParams = {};
  const staff = cleanString(reader.get('staff'));
  if (staff) out.staff = staff;
  const tab = pickOne(reader.get('tab'), HORARIOS_TABS);
  if (tab) out.tab = tab;
  const date = cleanString(reader.get('date'));
  if (date && isMetricDateKey(date)) out.date = date;
  const serviceId = cleanString(reader.get('serviceId'));
  if (serviceId) out.serviceId = serviceId;
  return out;
}

const SERVICIOS_TABS = new Set<ServiciosTabParam>(['servicios', 'extras', 'categorias']);

export function serviciosHref(params?: ServiciosLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    const id = cleanString(params.id);
    if (id) qs.set('id', id);
    if (params.tab) qs.set('tab', params.tab);
    const q = cleanString(params.q);
    if (q) qs.set('q', q);
  }
  return buildHref('/admin/servicios', qs);
}

export function parseServiciosParams(input: AdminSearchParamsInput): ServiciosLinkParams {
  const reader = toParamReader(input);
  const out: ServiciosLinkParams = {};
  const id = cleanString(reader.get('id'));
  if (id) out.id = id;
  const tab = pickOne(reader.get('tab'), SERVICIOS_TABS);
  if (tab) out.tab = tab;
  const q = cleanString(reader.get('q'));
  if (q) out.q = q;
  return out;
}

const EQUIPO_TABS = new Set<EquipoTabParam>(['equipo', 'accesos']);

export function equipoHref(params?: EquipoLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    const staffId = cleanString(params.staffId);
    if (staffId) qs.set('staffId', staffId);
    if (params.tab) qs.set('tab', params.tab);
  }
  return buildHref('/admin/equipo', qs);
}

export function parseEquipoParams(input: AdminSearchParamsInput): EquipoLinkParams {
  const reader = toParamReader(input);
  const out: EquipoLinkParams = {};
  const staffId = cleanString(reader.get('staffId') ?? reader.get('staff'));
  if (staffId) out.staffId = staffId;
  const tab = pickOne(reader.get('tab'), EQUIPO_TABS);
  if (tab) out.tab = tab;
  return out;
}

const INVENTARIO_FILTERS = new Set<InventarioFilterParam>([
  'all',
  'low',
  'retail',
  'supplies',
]);

export function inventarioHref(params?: InventarioLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    if (params.filter) qs.set('filter', params.filter);
    const itemId = cleanString(params.itemId);
    if (itemId) qs.set('itemId', itemId);
    const q = cleanString(params.q);
    if (q) qs.set('q', q);
  }
  return buildHref('/admin/inventario', qs);
}

export function parseInventarioParams(input: AdminSearchParamsInput): InventarioLinkParams {
  const reader = toParamReader(input);
  const out: InventarioLinkParams = {};
  const filter = pickOne(reader.get('filter'), INVENTARIO_FILTERS);
  if (filter) out.filter = filter;
  const itemId = cleanString(reader.get('itemId'));
  if (itemId) out.itemId = itemId;
  const q = cleanString(reader.get('q'));
  if (q) out.q = q;
  return out;
}

export function reportesHref(params?: ReportesLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    if (params.period) qs.set('period', params.period);
    const from = cleanString(params.from);
    if (from && isMetricDateKey(from)) qs.set('from', from);
    const to = cleanString(params.to);
    if (to && isMetricDateKey(to)) qs.set('to', to);
    const staff = cleanString(params.staff);
    if (staff) qs.set('staff', staff);
  }
  return buildHref('/admin/reportes', qs);
}

export function parseReportesParams(input: AdminSearchParamsInput): ReportesLinkParams {
  const reader = toParamReader(input);
  const out: ReportesLinkParams = {};
  const period = cleanString(reader.get('period'));
  if (isMetricReportPeriod(period)) out.period = period;
  const from = cleanString(reader.get('from'));
  if (from && isMetricDateKey(from)) out.from = from;
  const to = cleanString(reader.get('to'));
  if (to && isMetricDateKey(to)) out.to = to;
  const staff = cleanString(reader.get('staff'));
  if (staff) out.staff = staff;
  return out;
}

export function marcaHref(params?: MarcaLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    const tab = cleanString(params.tab);
    if (tab) qs.set('tab', tab);
    const focus = cleanString(params.focus);
    if (focus) qs.set('focus', focus);
  }
  return buildHref('/admin/marca', qs);
}

export function parseMarcaParams(input: AdminSearchParamsInput): MarcaLinkParams {
  const reader = toParamReader(input);
  const out: MarcaLinkParams = {};
  const tab = cleanString(reader.get('tab'));
  if (tab) out.tab = tab;
  const focus = cleanString(reader.get('focus'));
  if (focus) out.focus = focus;
  return out;
}

export function integracionesHref(params?: IntegracionesLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    const tab = cleanString(params.tab);
    if (tab) qs.set('tab', tab);
    const focus = cleanString(params.focus);
    if (focus) qs.set('focus', focus);
    const section = cleanString(params.section);
    if (section) qs.set('section', section);
    if (params.google) qs.set('google', params.google);
  }
  return buildHref('/admin/integraciones', qs, params?.hash);
}

export function parseIntegracionesParams(
  input: AdminSearchParamsInput,
): IntegracionesLinkParams {
  const reader = toParamReader(input);
  const out: IntegracionesLinkParams = {};
  const tab = cleanString(reader.get('tab'));
  if (tab) out.tab = tab;
  const focus = cleanString(reader.get('focus'));
  if (focus) out.focus = focus;
  const section = cleanString(reader.get('section'));
  if (section) out.section = section;
  const google = cleanString(reader.get('google'));
  if (google === 'connected' || google === 'error') out.google = google;
  if (reader.hash) out.hash = reader.hash;
  return out;
}

export function onboardingHref(params?: OnboardingLinkParams): string {
  const qs = new URLSearchParams();
  if (params) {
    const step = cleanString(params.step);
    if (step) qs.set('step', step);
  }
  return buildHref('/admin/onboarding', qs);
}

export function parseOnboardingParams(input: AdminSearchParamsInput): OnboardingLinkParams {
  const reader = toParamReader(input);
  const out: OnboardingLinkParams = {};
  const step = cleanString(reader.get('step'));
  if (step) out.step = step;
  return out;
}

export function resumenHref(params?: ResumenLinkParams): string {
  const qs = new URLSearchParams();
  if (params?.period) {
    qs.set('period', params.period);
  }
  return buildHref('/admin', qs);
}

export function parseResumenParams(input: AdminSearchParamsInput): ResumenLinkParams {
  const reader = toParamReader(input);
  const out: ResumenLinkParams = {};
  const period = cleanString(reader.get('period'));
  if (isMetricPeriod(period)) out.period = period;
  return out;
}

export function withAdminBaseUrl(baseUrl: string, adminPath: string): string {
  const normalizedBase = baseUrl.trim().replace(/\/+$/, '');
  const normalizedPath = adminPath.startsWith('/') ? adminPath : `/${adminPath}`;
  return `${normalizedBase}${normalizedPath}`;
}
