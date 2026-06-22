import { describe, it, expect } from 'vitest';
import { courtThemeFor } from '@/theme/courtTheme';
import { luminance, contrastRatio } from '@/theme/color';
import { palette } from '@/theme/palette';

describe('courtThemeFor', () => {
  it('keeps the floor dark even with a bright primary', () => {
    const theme = courtThemeFor('#ffffff', '#ffffff');
    // Only a small tint bleeds in, so the floor stays near the base court color.
    expect(luminance(theme.floorColor)).toBeLessThan(luminance('#808080'));
  });

  it('never returns a line color equal to the floor', () => {
    const theme = courtThemeFor('#2d3142', '#2e2e2e'); // both near the floor
    expect(theme.lineColor).not.toBe(theme.floorColor);
    expect(contrastRatio(theme.floorColor, theme.lineColor)).toBeGreaterThan(1.5);
  });

  it('uses a bright secondary as the line color when it reads', () => {
    // Nuggets-style gold secondary should win over the fallback.
    const theme = courtThemeFor('#0e2240', '#fec524');
    expect(theme.lineColor.toLowerCase()).toBe('#fec524');
  });

  it('keeps the line readable when both team colors are near the dark floor', () => {
    const theme = courtThemeFor('#1d1160', '#2e2e2e'); // both dark
    // Whatever it picks, the line must clear the readability bar over the floor.
    expect(contrastRatio(theme.floorColor, theme.lineColor)).toBeGreaterThanOrEqual(2.2);
    expect(theme.lineColor).toBe(palette.courtLine);
  });
});
