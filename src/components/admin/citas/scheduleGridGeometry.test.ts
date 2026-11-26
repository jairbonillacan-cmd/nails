import { describe, expect, it } from 'vitest';
import {
  buildZonedIsoForDateAndMinutes,
  computeBlockGeometryPercent,
  computeNowIndicator,
  formatMinutesHHMM,
  getLocalMinutesInTimezone,
} from './scheduleGridGeometry';

describe('scheduleGridGeometry', () => {
  const tz = 'America/Mexico_City';

  it('converts Mexico City local date and minutes to accurate UTC ISO and back', () => {
    const iso = buildZonedIsoForDateAndMinutes('2026-11-26', 13 * 60 + 30, tz);
    expect(iso).toBe('2026-11-26T19:30:00.000Z');
    expect(getLocalMinutesInTimezone(iso, tz)).toBe(13 * 60 + 30);
    expect(formatMinutesHHMM(13 * 60 + 30)).toBe('13:30');
  });

  it('computes bounded block percentage geometry for 09:00-20:00 grid', () => {
    const startBlock = computeBlockGeometryPercent(9 * 60, 60);
    expect(startBlock.topPct).toBe(0);
    expect(startBlock.heightPct).toBeCloseTo((60 / 660) * 100, 2);

    const afternoon = computeBlockGeometryPercent(14 * 60 + 30, 90);
    expect(afternoon.topPct).toBeCloseTo((330 / 660) * 100, 2);
    expect(afternoon.heightPct).toBeCloseTo((90 / 660) * 100, 2);
  });

  it('renders live now indicator only on today within business window', () => {
    const middayMs = Date.parse('2026-11-26T20:30:00.000Z');
    const onToday = computeNowIndicator(middayMs, '2026-11-26', '2026-11-26', tz);
    expect(onToday.visible).toBe(true);
    expect(onToday.label).toBe('14:30');
    expect(onToday.topPct).toBeCloseTo(50, 1);

    const onOtherDay = computeNowIndicator(middayMs, '2026-11-27', '2026-11-26', tz);
    expect(onOtherDay.visible).toBe(false);
  });
});
