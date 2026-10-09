// Display fixtures only: names, scores, dates and venues await backend integration.
// Values follow the official BWF baseline (best of 3 games to 21); they are not the event format or a scoring engine (see doc/rules.md).
// periods: 3 game slots, null = not played; winner = side index (0 | 1); current = game in progress. score = games won.
export const scoring = { model: 'set', unit: 'Game', short: 'G', total: 'Games', totalName: 'Games won' };

export const liveMatches = [
  {
    id: 'live-ms-iyer-khan', status: 'live', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '4:00 PM', venue: 'Sports Complex · Court 2', clock: 'Game 2 · 19–17',
    sides: [
      { name: 'Iyer', team: 'CSE · Year 3', players: [{ name: 'Arjun Iyer', serving: true }] },
      { name: 'Khan', team: 'ECE · Year 2', players: [{ name: 'Sameer Khan' }] },
    ],
    periods: [{ points: [21, 18], winner: 0 }, { points: [19, 17], current: true }, null],
    score: [1, 0], winner: null,
  },
  {
    id: 'live-wd-rao-sen', status: 'live', category: 'Women’s Doubles', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '4:00 PM', venue: 'Sports Complex · Court 1', clock: 'Game 3 · 11–9',
    sides: [
      { name: 'Rao / Sen', team: 'Mechanical · Year 4', players: [{ name: 'Meera Rao' }, { name: 'Kavya Sen', serving: true }] },
      { name: 'Das / Paul', team: 'Biotech · Year 2', players: [{ name: 'Riya Das' }, { name: 'Anika Paul' }] },
    ],
    periods: [{ points: [18, 21], winner: 1 }, { points: [21, 19], winner: 0 }, { points: [11, 9], current: true }],
    score: [1, 1], winner: null,
  },
  {
    id: 'live-ms-mehta-bose', status: 'ended', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 4',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '2:30 PM', venue: 'Sports Complex · Court 3', clock: null,
    sides: [
      { name: 'Mehta', team: 'Civil · Year 3', players: [{ name: 'Rohan Mehta' }] },
      { name: 'Bose', team: 'Electrical · Year 1', players: [{ name: 'Aditya Bose' }] },
    ],
    periods: [{ points: [21, 15], winner: 0 }, { points: [19, 21], winner: 1 }, { points: [22, 20], winner: 0 }],
    score: [2, 1], winner: 0,
  },
  {
    id: 'live-xd-kapoor-nair', status: 'live', category: 'Mixed Doubles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '4:30 PM', venue: 'Sports Complex · Court 4', clock: 'Game 1 · 9–6',
    sides: [
      { name: 'Kapoor / Nair', team: 'CSE · Year 2', players: [{ name: 'Dev Kapoor' }, { name: 'Isha Nair' }] },
      { name: 'Joshi / Pillai', team: 'Chemical · Year 3', players: [{ name: 'Kunal Joshi', serving: true }, { name: 'Tara Pillai' }] },
    ],
    periods: [{ points: [9, 6], current: true }, null, null],
    score: [0, 0], winner: null,
  },
];

export const upcomingMatches = [
  {
    id: 'up-ws-gill-verma', status: 'scheduled', category: 'Women’s Singles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '5:30 PM', venue: 'Sports Complex · Court 1',
    sides: [
      { name: 'Gill', team: 'ECE · Year 3', players: [{ name: 'Simran Gill' }] },
      { name: 'Verma', team: 'CSE · Year 1', players: [{ name: 'Nisha Verma' }] },
    ],
  },
  {
    id: 'up-md-arora-singh', status: 'scheduled', category: 'Men’s Doubles', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '6:15 PM', venue: 'Sports Complex · Court 2',
    sides: [
      { name: 'Arora / Singh', team: 'Mechanical · Year 2', players: [{ name: 'Kabir Arora' }, { name: 'Jaspreet Singh' }] },
      { name: 'Malik / Roy', team: 'Civil · Year 4', players: [{ name: 'Faizan Malik' }, { name: 'Arnav Roy' }] },
    ],
  },
  {
    id: 'up-ms-final', status: 'scheduled', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Final',
    date: '2026-10-11', dateLabel: '11 Oct', timeLabel: '10:00 AM', venue: 'Sports Complex · Court 2',
    sides: [
      { name: 'Mehta', team: 'Civil · Year 3', players: [{ name: 'Rohan Mehta' }] },
      { name: 'Chopra', team: 'Biotech · Year 3', players: [{ name: 'Vikram Chopra' }] },
    ],
  },
  {
    id: 'up-xd-bajaj-menon', status: 'scheduled', category: 'Mixed Doubles', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-11', dateLabel: '11 Oct', timeLabel: '11:30 AM', venue: 'Sports Complex · Court 3',
    sides: [
      { name: 'Bajaj / Menon', team: 'Electrical · Year 2', players: [{ name: 'Yash Bajaj' }, { name: 'Diya Menon' }] },
      { name: 'Saini / Kaur', team: 'ECE · Year 4', players: [{ name: 'Harsh Saini' }, { name: 'Gurleen Kaur' }] },
    ],
  },
  {
    id: 'up-ws-dutta-sharma', status: 'scheduled', category: 'Women’s Singles', tournament: 'Inter-Hostel Cup', round: 'Round 1',
    date: '2026-10-15', dateLabel: '15 Oct', timeLabel: '9:00 AM', venue: 'Hostel J Court',
    sides: [
      { name: 'Dutta', team: 'Hostel A', players: [{ name: 'Priya Dutta' }] },
      { name: 'Sharma', team: 'Hostel J', players: [{ name: 'Ananya Sharma' }] },
    ],
  },
];

export const pastMatches = [
  {
    id: 'past-ms-chopra-yadav', status: 'completed', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 3',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '5:00 PM', venue: 'Sports Complex · Court 2',
    sides: [
      { name: 'Chopra', team: 'Biotech · Year 3', players: [{ name: 'Vikram Chopra' }] },
      { name: 'Yadav', team: 'Mechanical · Year 1', players: [{ name: 'Rahul Yadav' }] },
    ],
    periods: [{ points: [21, 12], winner: 0 }, { points: [21, 16], winner: 0 }, null],
    score: [2, 0], winner: 0,
  },
  {
    id: 'past-wd-kaur-jain', status: 'completed', category: 'Women’s Doubles', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 1',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '3:30 PM', venue: 'Sports Complex · Court 1',
    sides: [
      { name: 'Kaur / Jain', team: 'CSE · Year 4', players: [{ name: 'Navneet Kaur' }, { name: 'Sakshi Jain' }] },
      { name: 'Rao / Sen', team: 'Mechanical · Year 4', players: [{ name: 'Meera Rao' }, { name: 'Kavya Sen' }] },
    ],
    periods: [{ points: [21, 17], winner: 0 }, { points: [15, 21], winner: 1 }, { points: [18, 21], winner: 1 }],
    score: [1, 2], winner: 1,
  },
  {
    id: 'past-ms-iyer-ghosh', status: 'completed', category: 'Men’s Singles', tournament: 'Thaparlympics 2026', round: 'Round of 16',
    date: '2026-10-02', dateLabel: '2 Oct', timeLabel: '4:00 PM', venue: 'Sports Complex · Court 3',
    sides: [
      { name: 'Iyer', team: 'CSE · Year 3', players: [{ name: 'Arjun Iyer' }] },
      { name: 'Ghosh', team: 'Civil · Year 2', players: [{ name: 'Sourav Ghosh' }] },
    ],
    periods: [{ points: [23, 21], winner: 0 }, { points: [21, 19], winner: 0 }, null],
    score: [2, 0], winner: 0,
  },
  {
    id: 'past-xd-mehra-das', status: 'completed', category: 'Mixed Doubles', tournament: 'Thaparlympics 2026', round: 'Round of 16',
    date: '2026-10-02', dateLabel: '2 Oct', timeLabel: '2:00 PM', venue: 'Sports Complex · Court 4',
    sides: [
      { name: 'Mehra / Das', team: 'ECE · Year 1', players: [{ name: 'Aman Mehra' }, { name: 'Pooja Das' }] },
      { name: 'Joshi / Pillai', team: 'Chemical · Year 3', players: [{ name: 'Kunal Joshi' }, { name: 'Tara Pillai' }] },
    ],
    periods: [{ points: [14, 21], winner: 1 }, { points: [19, 21], winner: 1 }, null],
    score: [0, 2], winner: 1,
  },
  {
    id: 'past-ws-gill-thomas', status: 'completed', category: 'Women’s Singles', tournament: 'Thaparlympics 2026', round: 'Round of 16',
    date: '2026-10-01', dateLabel: '1 Oct', timeLabel: '5:30 PM', venue: 'Sports Complex · Court 1',
    sides: [
      { name: 'Gill', team: 'ECE · Year 3', players: [{ name: 'Simran Gill' }] },
      { name: 'Thomas', team: 'Biotech · Year 1', players: [{ name: 'Neha Thomas' }] },
    ],
    periods: [{ points: [21, 18], winner: 0 }, { points: [17, 21], winner: 1 }, { points: [21, 13], winner: 0 }],
    score: [2, 1], winner: 0,
  },
  {
    id: 'past-md-arora-singh', status: 'completed', category: 'Men’s Doubles', tournament: 'Thaparlympics 2026', round: 'Round of 16',
    date: '2026-10-01', dateLabel: '1 Oct', timeLabel: '3:00 PM', venue: 'Sports Complex · Court 2',
    sides: [
      { name: 'Arora / Singh', team: 'Mechanical · Year 2', players: [{ name: 'Kabir Arora' }, { name: 'Jaspreet Singh' }] },
      { name: 'Bhatt / Lal', team: 'Electrical · Year 3', players: [{ name: 'Om Bhatt' }, { name: 'Varun Lal' }] },
    ],
    periods: [{ points: [21, 10], winner: 0 }, { points: [21, 14], winner: 0 }, null],
    score: [2, 0], winner: 0,
  },
];
