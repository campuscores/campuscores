// Display fixtures only: names, scores, dates and venues await backend integration.
// Values follow the official ITTF baseline (best of 5 games to 11, win by 2); they are not the event format or a scoring engine (see doc/rules.md).
// periods: 5 game slots, null = not played; winner = side index (0 | 1); current = game in progress. score = games won.
export const scoring = { model: 'set', unit: 'Game', short: 'G', total: 'T', totalName: 'Games won' };
export const liveMatches = [
  {
    id: 'live-ms-sharma-gupta', status: 'live', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '4:00 PM', venue: 'Sports Complex · Table 1', clock: 'Game 4 · 7–5',
    sides: [
      { name: 'Sharma', team: 'CSE · Year 2', players: [{ name: 'Varun Sharma', serving: true }] },
      { name: 'Gupta', team: 'ECE · Year 3', players: [{ name: 'Nitin Gupta' }] },
    ],
    periods: [{ points: [11, 8], winner: 0 }, { points: [9, 11], winner: 1 }, { points: [11, 6], winner: 0 }, { points: [7, 5], current: true }, null],
    score: [2, 1], winner: null,
  },
  {
    id: 'live-wd-arya-lamba', status: 'live', category: 'Women’s Doubles', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '4:00 PM', venue: 'Sports Complex · Table 2', clock: 'Game 3 · 3–2',
    sides: [
      { name: 'Arya / Bose', team: 'Mechanical · Year 3', players: [{ name: 'Kriti Arya' }, { name: 'Pooja Bose' }] },
      { name: 'Lamba / Chadha', team: 'Biotech · Year 2', players: [{ name: 'Neha Lamba', serving: true }, { name: 'Ritika Chadha' }] },
    ],
    periods: [{ points: [12, 10], winner: 0 }, { points: [7, 11], winner: 1 }, { points: [3, 2], current: true }, null, null],
    score: [1, 1], winner: null,
  },
  {
    id: 'live-md-walia-batra', status: 'ended', category: 'Men’s Doubles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 3',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '2:00 PM', venue: 'Sports Complex · Table 3', clock: null,
    sides: [
      { name: 'Walia / Sandhu', team: 'Civil · Year 4', players: [{ name: 'Gaurav Walia' }, { name: 'Harman Sandhu' }] },
      { name: 'Batra / Kohli', team: 'CSE · Year 1', players: [{ name: 'Ayush Batra' }, { name: 'Siddharth Kohli' }] },
    ],
    periods: [{ points: [11, 7], winner: 0 }, { points: [8, 11], winner: 1 }, { points: [11, 13], winner: 1 }, { points: [11, 4], winner: 0 }, { points: [11, 9], winner: 0 }],
    score: [3, 2], winner: 0,
  },
];
export const upcomingMatches = [
  {
    id: 'up-ws-taneja-khurana', status: 'scheduled', category: 'Women’s Singles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '5:30 PM', venue: 'Sports Complex · Table 1',
    sides: [
      { name: 'Taneja', team: 'ECE · Year 1', players: [{ name: 'Ishita Taneja' }] },
      { name: 'Khurana', team: 'Chemical · Year 2', players: [{ name: 'Simran Khurana' }] },
    ],
  },
  {
    id: 'up-xd-malhotra-bajwa', status: 'scheduled', category: 'Mixed Doubles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '6:30 PM', venue: 'Sports Complex · Table 2',
    sides: [
      { name: 'Malhotra / Rawat', team: 'Electrical · Year 3', players: [{ name: 'Kunal Malhotra' }, { name: 'Diya Rawat' }] },
      { name: 'Bajwa / Oberoi', team: 'CSE · Year 4', players: [{ name: 'Aman Bajwa' }, { name: 'Mansi Oberoi' }] },
    ],
  },
  {
    id: 'up-md-walia-dua', status: 'scheduled', category: 'Men’s Doubles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-11', dateLabel: '11 Oct', timeLabel: '11:00 AM', venue: 'Sports Complex · Table 1',
    sides: [
      { name: 'Walia / Sandhu', team: 'Civil · Year 4', players: [{ name: 'Gaurav Walia' }, { name: 'Harman Sandhu' }] },
      { name: 'Dua / Bhatia', team: 'Mechanical · Year 2', players: [{ name: 'Rohan Dua' }, { name: 'Kabir Bhatia' }] },
    ],
  },
  {
    id: 'up-ms-saluja-anand', status: 'scheduled', category: 'Men’s Singles', tournament: 'Inter-Hostel Cup', round: 'Round 1',
    date: '2026-10-15', dateLabel: '15 Oct', timeLabel: '10:00 AM', venue: 'Hostel C Hall',
    sides: [
      { name: 'Saluja', team: 'Hostel C', players: [{ name: 'Tarun Saluja' }] },
      { name: 'Anand', team: 'Hostel K', players: [{ name: 'Pranav Anand' }] },
    ],
  },
];
export const pastMatches = [
  {
    id: 'past-ms-sharma-mehra', status: 'completed', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 1',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '4:30 PM', venue: 'Sports Complex · Table 1',
    sides: [
      { name: 'Sharma', team: 'CSE · Year 2', players: [{ name: 'Varun Sharma' }] },
      { name: 'Mehra', team: 'Civil · Year 1', players: [{ name: 'Lakshay Mehra' }] },
    ],
    periods: [{ points: [11, 5], winner: 0 }, { points: [11, 7], winner: 0 }, { points: [11, 3], winner: 0 }, null, null],
    score: [3, 0], winner: 0,
  },
  {
    id: 'past-wd-garg-lamba', status: 'completed', category: 'Women’s Doubles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '3:00 PM', venue: 'Sports Complex · Table 2',
    sides: [
      { name: 'Garg / Nanda', team: 'ECE · Year 4', players: [{ name: 'Shreya Garg' }, { name: 'Avni Nanda' }] },
      { name: 'Lamba / Chadha', team: 'Biotech · Year 2', players: [{ name: 'Neha Lamba' }, { name: 'Ritika Chadha' }] },
    ],
    periods: [{ points: [11, 9], winner: 0 }, { points: [5, 11], winner: 1 }, { points: [11, 8], winner: 0 }, { points: [9, 11], winner: 1 }, { points: [6, 11], winner: 1 }],
    score: [2, 3], winner: 1,
  },
  {
    id: 'past-ms-gupta-sood', status: 'completed', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-02', dateLabel: '2 Oct', timeLabel: '5:00 PM', venue: 'Sports Complex · Table 1',
    sides: [
      { name: 'Gupta', team: 'ECE · Year 3', players: [{ name: 'Nitin Gupta' }] },
      { name: 'Sood', team: 'Mechanical · Year 4', players: [{ name: 'Harsh Sood' }] },
    ],
    periods: [{ points: [14, 12], winner: 0 }, { points: [11, 6], winner: 0 }, { points: [8, 11], winner: 1 }, { points: [11, 7], winner: 0 }, null],
    score: [3, 1], winner: 0,
  },
  {
    id: 'past-ws-pal-khurana', status: 'completed', category: 'Women’s Singles', tournament: 'Thaparlympics 2026', round: 'Round of 16',
    date: '2026-10-01', dateLabel: '1 Oct', timeLabel: '4:00 PM', venue: 'Sports Complex · Table 3',
    sides: [
      { name: 'Pal', team: 'Electrical · Year 2', players: [{ name: 'Riya Pal' }] },
      { name: 'Khurana', team: 'Chemical · Year 2', players: [{ name: 'Simran Khurana' }] },
    ],
    periods: [{ points: [4, 11], winner: 1 }, { points: [9, 11], winner: 1 }, { points: [11, 13], winner: 1 }, null, null],
    score: [0, 3], winner: 1,
  },
];
