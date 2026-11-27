import { describe, expect, it } from 'vitest';
import {
  agendaHref,
  cajaHref,
  clientasHref,
  equipoHref,
  horariosHref,
  integracionesHref,
  inventarioHref,
  marcaHref,
  onboardingHref,
  parseAgendaParams,
  parseCajaParams,
  parseClientasParams,
  parseEquipoParams,
  parseHorariosParams,
  parseIntegracionesParams,
  parseInventarioParams,
  parseMarcaParams,
  parseOnboardingParams,
  parseReportesParams,
  parseResumenParams,
  parseServiciosParams,
  parseWhatsAppParams,
  reportesHref,
  resumenHref,
  serviciosHref,
  whatsappHref,
  withAdminBaseUrl,
  type AgendaLinkParams,
  type CajaLinkParams,
  type ClientasLinkParams,
  type EquipoLinkParams,
  type HorariosLinkParams,
  type IntegracionesLinkParams,
  type InventarioLinkParams,
  type MarcaLinkParams,
  type OnboardingLinkParams,
  type ReportesLinkParams,
  type ResumenLinkParams,
  type ServiciosLinkParams,
  type WhatsAppLinkParams,
} from './admin-links';

describe('Typed Admin Deep Links (src/lib/admin-links.ts)', () => {
  it('round-trips Agenda links across view, date, staff, status, search, collect, and new prefill', () => {
    const input: AgendaLinkParams = {
      view: 'list',
      date: '2026-11-27',
      staff: 'staff-karla',
      status: 'uncollected',
      q: 'NL-1042',
      tab: 'upcoming',
      new: true,
      collect: 'bk-1001',
      clientName: 'Sofía Ramírez',
      clientPhone: '+522224123987',
      clientInstagram: '@sofia.ramirez.pue',
      staffId: 'staff-karla',
      serviceId: 'srv-rubber',
      panel: 'waitlist',
    };

    const href = agendaHref(input);
    expect(href.startsWith('/admin/citas?')).toBe(true);
    expect(parseAgendaParams(href)).toEqual(input);
    expect(agendaHref()).toBe('/admin/citas');
    expect(parseAgendaParams('/admin/citas')).toEqual({});
    expect(parseAgendaParams('/admin/citas?tab=unconfirmed&status=unconfirmed')).toEqual({
      tab: 'pending',
      status: 'pending',
    });
  });

  it('round-trips Caja links and normalizes legacy tab/sub aliases', () => {
    const input: CajaLinkParams = {
      tab: 'promos',
      sub: 'packages',
      period: 'custom',
      from: '2026-11-01',
      to: '2026-11-27',
      staff: 'staff-karla',
      method: 'transfer',
      quickSaleProductId: 'inv-3',
      q: 'NL-1042',
    };

    const href = cajaHref(input);
    expect(href).toBe(
      '/admin/caja?tab=promos&sub=packages&period=custom&from=2026-11-01&to=2026-11-27&staff=staff-karla&method=transfer&quickSaleProductId=inv-3&q=NL-1042',
    );
    expect(parseCajaParams(href)).toEqual(input);
    expect(parseCajaParams('/admin/caja?tab=deposits&sub=paquetes')).toEqual({
      tab: 'anticipos',
      sub: 'packages',
    });
    expect(parseCajaParams('/admin/caja?tab=uncollected')).toEqual({ tab: 'sin-cobrar' });
    expect(parseCajaParams('/admin/caja?tab=commissions')).toEqual({ tab: 'comisiones' });
  });

  it('round-trips Clientas, WhatsApp, Horarios, Servicios, Equipo, Inventario, Reportes, Marca, Integraciones, Onboarding, and Resumen links', () => {
    const clientasInput: ClientasLinkParams = {
      tab: 'retencion',
      q: '+522224123987',
      clientId: 'client-sofia',
      filter: 'vip',
    };
    expect(parseClientasParams(clientasHref(clientasInput))).toEqual(clientasInput);

    const waInput: WhatsAppLinkParams = {
      tab: 'recordatorios',
      phone: '+522224123987',
      bookingId: 'bk-1001',
      clientId: 'client-sofia',
      filter: 'failed',
      q: 'Andrea',
    };
    expect(parseWhatsAppParams(whatsappHref(waInput))).toEqual(waInput);

    const horariosInput: HorariosLinkParams = {
      staff: 'staff-karla',
      tab: 'diagnostico',
      date: '2026-11-28',
      serviceId: 'srv-rubber',
    };
    expect(parseHorariosParams(horariosHref(horariosInput))).toEqual(horariosInput);

    const serviciosInput: ServiciosLinkParams = {
      id: 'srv-rubber',
      tab: 'servicios',
      q: 'Rubber',
    };
    expect(parseServiciosParams(serviciosHref(serviciosInput))).toEqual(serviciosInput);

    const equipoInput: EquipoLinkParams = {
      staffId: 'staff-karla',
      tab: 'equipo',
    };
    expect(parseEquipoParams(equipoHref(equipoInput))).toEqual(equipoInput);
    expect(parseEquipoParams('/admin/equipo?staff=staff-paty')).toEqual({
      staffId: 'staff-paty',
    });

    const inventarioInput: InventarioLinkParams = {
      filter: 'low_stock',
      itemId: 'inv-1',
      q: 'Rubber',
    };
    expect(parseInventarioParams(inventarioHref(inventarioInput))).toEqual(inventarioInput);
    expect(parseInventarioParams('/admin/inventario?filter=low')).toEqual({
      filter: 'low_stock',
    });
    expect(parseInventarioParams('/admin/inventario?filter=supplies')).toEqual({
      filter: 'cabin',
    });
    expect(parseInventarioParams(inventarioHref({ filter: 'cabin' }))).toEqual({
      filter: 'cabin',
    });
    expect(parseInventarioParams(inventarioHref({ filter: 'retail' }))).toEqual({
      filter: 'retail',
    });

    const reportesInput: ReportesLinkParams = {
      period: 'custom',
      from: '2026-10-01',
      to: '2026-10-31',
      staff: 'staff-karla',
    };
    expect(parseReportesParams(reportesHref(reportesInput))).toEqual(reportesInput);

    const marcaInput: MarcaLinkParams = {
      tab: 'cobro',
      focus: 'clabe',
    };
    expect(parseMarcaParams(marcaHref(marcaInput))).toEqual(marcaInput);

    const integracionesInput: IntegracionesLinkParams = {
      tab: 'calendario',
      focus: 'google',
      section: 'resenas',
      google: 'connected',
      hash: 'analytics-heading',
    };
    const intHref = integracionesHref(integracionesInput);
    expect(intHref.endsWith('#analytics-heading')).toBe(true);
    expect(parseIntegracionesParams(intHref)).toEqual(integracionesInput);

    const onboardingInput: OnboardingLinkParams = { step: '3' };
    expect(parseOnboardingParams(onboardingHref(onboardingInput))).toEqual(onboardingInput);

    const resumenInput: ResumenLinkParams = { period: '7d' };
    expect(parseResumenParams(resumenHref(resumenInput))).toEqual(resumenInput);
  });

  it('drops invalid enum/date values safely and composes absolute base URLs cleanly', () => {
    expect(
      parseAgendaParams('/admin/citas?view=invalid&date=not-a-date&status=bogus&tab=nope'),
    ).toEqual({});
    expect(parseCajaParams('/admin/caja?tab=unknown&period=365d&method=crypto')).toEqual({});
    expect(parseReportesParams('/admin/reportes?period=365d')).toEqual({});
    expect(withAdminBaseUrl('https://laikona.mx/', cajaHref({ tab: 'anticipos' }))).toBe(
      'https://laikona.mx/admin/caja?tab=anticipos',
    );
  });
});
