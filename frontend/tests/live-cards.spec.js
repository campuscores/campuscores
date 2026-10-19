import { test, expect } from '@playwright/test';
import { toMatchProp } from '../src/features/matches/liveCards.js';

// Pure mapping checks; no browser page is opened.
test.describe('Home_Room card to LiveMatchCard prop', () => {
  test('maps a full card to the existing shell', () => {
    const match = toMatchProp({ id: '7', sport: 'lawn-tennis', status: 'LIVE', competition: 'Spring Cup', sides: [{ name: 'Ana' }, { name: 'Ben' }], score: [3, 0], clock: null, seq: 4 });
    expect(match).toEqual({
      id: '7',
      sport: 'lawn-tennis',
      sportLabel: 'Tennis',
      competition: 'Spring Cup',
      score: '3–0',
      clock: '',
      columns: [{ key: 'total', label: 'T', className: 'match-total', description: 'Total' }],
      sides: [{ name: 'Ana', values: ['3'] }, { name: 'Ben', values: ['0'] }],
    });
  });

  test('uses the confirmed defaults for missing fields', () => {
    const match = toMatchProp({ id: '8', sport: 'football', sides: [{ name: null }], score: [1] });
    expect(match).toMatchObject({ competition: '', score: 'VS', clock: '', sides: [{ name: 'TBD', values: ['—'] }, { name: 'TBD', values: ['—'] }] });
  });
});
