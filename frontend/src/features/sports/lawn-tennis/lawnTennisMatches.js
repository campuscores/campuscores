// Display fixtures only: names, scores, dates and venues await backend integration.
// Values follow the official ITF baseline (best of 3 advantage sets, 7-point tiebreak at 6–6); they are not the event format or a scoring engine (see doc/rules.md).
// periods: 3 set slots, null = not played; tiebreak = [a, b] points of a 7–6 set. gamePoints = live points in the current game. score = sets won.
export const scoring = { model: 'set', unit: 'Set', short: 'S', total: 'Sets', totalName: 'Sets won' };
export const liveMatches = [
  {
    id: 'live-ms-rao-singh', status: 'live', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '3:30 PM', venue: 'Tennis Courts · Court 1', clock: 'Set 3 · 4–3 · 30–15',
    sides: [
      { name: 'Rao', team: 'CSE · Year 4', players: [{ name: 'Karan Rao', serving: true }] },
      { name: 'Singh', team: 'Mechanical · Year 2', players: [{ name: 'Manav Singh' }] },
    ],
    periods: [{ points: [6, 4], winner: 0 }, { points: [3, 6], winner: 1 }, { points: [4, 3], current: true }],
    score: [1, 1], winner: null, gamePoints: ['30', '15'],
  },
  {
    id: 'live-xd-bedi-thakur', status: 'live', category: 'Mixed Doubles', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '3:30 PM', venue: 'Tennis Courts · Court 2', clock: 'Set 2 · Tiebreak · 5–3',
    sides: [
      { name: 'Bedi / Thakur', team: 'ECE · Year 3', players: [{ name: 'Rhea Bedi' }, { name: 'Nikhil Thakur' }] },
      { name: 'Grover / Ahuja', team: 'Civil · Year 2', players: [{ name: 'Sahil Grover', serving: true }, { name: 'Tanya Ahuja' }] },
    ],
    periods: [{ points: [7, 5], winner: 0 }, { points: [6, 6], current: true }, null],
    score: [1, 0], winner: null, gamePoints: ['5', '3'],
  },
  {
    id: 'live-ws-mann-bhalla', status: 'ended', category: 'Women’s Singles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '1:00 PM', venue: 'Tennis Courts · Court 3', clock: null,
    sides: [
      { name: 'Mann', team: 'Biotech · Year 3', players: [{ name: 'Jasleen Mann' }] },
      { name: 'Bhalla', team: 'CSE · Year 1', players: [{ name: 'Ira Bhalla' }] },
    ],
    periods: [{ points: [6, 7], winner: 1, tiebreak: [4, 7] }, { points: [6, 2], winner: 0 }, { points: [6, 4], winner: 0 }],
    score: [2, 1], winner: 0,
  },
];
export const upcomingMatches = [
  {
    id: 'up-ws-mann-kohli', status: 'scheduled', category: 'Women’s Singles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '5:00 PM', venue: 'Tennis Courts · Court 1',
    sides: [
      { name: 'Mann', team: 'Biotech · Year 3', players: [{ name: 'Jasleen Mann' }] },
      { name: 'Kohli', team: 'ECE · Year 2', players: [{ name: 'Aditi Kohli' }] },
    ],
  },
  {
    id: 'up-md-sethi-chawla', status: 'scheduled', category: 'Men’s Doubles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '6:00 PM', venue: 'Tennis Courts · Court 2',
    sides: [
      { name: 'Sethi / Bansal', team: 'CSE · Year 3', players: [{ name: 'Arnav Sethi' }, { name: 'Rohit Bansal' }] },
      { name: 'Chawla / Mittal', team: 'Electrical · Year 2', players: [{ name: 'Dhruv Chawla' }, { name: 'Parth Mittal' }] },
    ],
  },
  {
    id: 'up-md-kalra-rana', status: 'scheduled', category: 'Men’s Doubles', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-11', dateLabel: '11 Oct', timeLabel: '10:00 AM', venue: 'Tennis Courts · Court 1',
    sides: [
      { name: 'Kalra / Sood', team: 'Chemical · Year 3', players: [{ name: 'Vivek Kalra' }, { name: 'Aryan Sood' }] },
      { name: 'Rana / Puri', team: 'Mechanical · Year 4', players: [{ name: 'Jai Rana' }, { name: 'Kshitij Puri' }] },
    ],
  },
  {
    id: 'up-ms-vohra-gera', status: 'scheduled', category: 'Men’s Singles', tournament: 'Inter-Hostel Cup', round: 'Round 1',
    date: '2026-10-15', dateLabel: '15 Oct', timeLabel: '9:00 AM', venue: 'Hostel H Court',
    sides: [
      { name: 'Vohra', team: 'Hostel B', players: [{ name: 'Ishaan Vohra' }] },
      { name: 'Gera', team: 'Hostel H', players: [{ name: 'Yuvraj Gera' }] },
    ],
  },
];
export const pastMatches = [
  {
    id: 'past-ms-singh-negi', status: 'completed', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 1',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '4:00 PM', venue: 'Tennis Courts · Court 1',
    sides: [
      { name: 'Singh', team: 'Mechanical · Year 2', players: [{ name: 'Manav Singh' }] },
      { name: 'Negi', team: 'Civil · Year 3', players: [{ name: 'Akash Negi' }] },
    ],
    periods: [{ points: [6, 2], winner: 0 }, { points: [6, 4], winner: 0 }, null],
    score: [2, 0], winner: 0,
  },
  {
    id: 'past-xd-kapoor-grover', status: 'completed', category: 'Mixed Doubles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '2:00 PM', venue: 'Tennis Courts · Court 2',
    sides: [
      { name: 'Kapoor / Sinha', team: 'ECE · Year 1', players: [{ name: 'Raghav Kapoor' }, { name: 'Sana Sinha' }] },
      { name: 'Grover / Ahuja', team: 'Civil · Year 2', players: [{ name: 'Sahil Grover' }, { name: 'Tanya Ahuja' }] },
    ],
    periods: [{ points: [6, 4], winner: 0 }, { points: [3, 6], winner: 1 }, { points: [5, 7], winner: 1 }],
    score: [1, 2], winner: 1,
  },
  {
    id: 'past-ms-rao-kumar', status: 'completed', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-02', dateLabel: '2 Oct', timeLabel: '3:00 PM', venue: 'Tennis Courts · Court 1',
    sides: [
      { name: 'Rao', team: 'CSE · Year 4', players: [{ name: 'Karan Rao' }] },
      { name: 'Kumar', team: 'Electrical · Year 1', players: [{ name: 'Abhay Kumar' }] },
    ],
    periods: [{ points: [7, 6], winner: 0, tiebreak: [8, 6] }, { points: [6, 1], winner: 0 }, null],
    score: [2, 0], winner: 0,
  },
  {
    id: 'past-ws-joshi-mann', status: 'completed', category: 'Women’s Singles', tournament: 'Thaparlympics 2026', round: 'Round of 16',
    date: '2026-10-01', dateLabel: '1 Oct', timeLabel: '5:00 PM', venue: 'Tennis Courts · Court 3',
    sides: [
      { name: 'Joshi', team: 'Chemical · Year 2', players: [{ name: 'Pallavi Joshi' }] },
      { name: 'Mann', team: 'Biotech · Year 3', players: [{ name: 'Jasleen Mann' }] },
    ],
    periods: [{ points: [2, 6], winner: 1 }, { points: [4, 6], winner: 1 }, null],
    score: [0, 2], winner: 1,
  },
];
