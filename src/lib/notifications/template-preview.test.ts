import { describe, expect, it } from 'vitest';
import { buildTemplatePreview, describeWorkflowMoment } from './template-preview';

describe('template preview', () => {
  it('does not repeat the period after a time sample', () => {
    const text = buildTemplatePreview('a las {{time_label}}. Gracias', { salonName: 'X', address: 'Y' })
      .map((s) => s.text)
      .join('');
    expect(text).toBe('a las 2:00 p.m. Gracias');
  });

  it('replaces placeholders with sample values and readable link labels', () => {
    const segments = buildTemplatePreview(
      'Hola {{client_name}}, te esperamos en {{salon_name}}. Confirma aquí: {{confirm_url}}',
      { salonName: 'LAIKONA NAILS', address: 'Calle 25 Sur' },
    );
    const text = segments.map((segment) => segment.text).join('');
    expect(text).toBe('Hola Sofía, te esperamos en LAIKONA NAILS. Confirma aquí: confirmar');
    expect(text).not.toContain('{{');
    expect(segments.find((segment) => segment.kind === 'link')?.text).toBe('confirmar');
  });

  it('describes when each automatic message is sent in plain words', () => {
    expect(describeWorkflowMoment({ triggerEvent: 'before_booking', offsetMinutes: 1440, name: '' })).toBe(
      'Un día antes de la cita',
    );
    expect(describeWorkflowMoment({ triggerEvent: 'before_booking', offsetMinutes: 120, name: '' })).toBe(
      '2 horas antes de la cita',
    );
    expect(describeWorkflowMoment({ triggerEvent: 'after_booking', offsetMinutes: 18 * 1440, name: '' })).toBe(
      '18 días después de la cita',
    );
    expect(describeWorkflowMoment({ triggerEvent: 'booking_created', offsetMinutes: 0, name: '' })).toBe(
      'Al apartar su cita',
    );
  });
});
