// Display fixtures only: names, scores, dates and venues await backend integration.
// Values follow the official FIVB baseline (best of 5 sets to 25, fifth set to 15, win by 2); they are not the event format or a scoring engine (see doc/rules.md).
// periods: 5 set slots, null = not played; winner = side index (0 | 1); current = set in progress. score = sets won. serving is on the side, not a player.
export const scoring = { model: 'set', unit: 'Set', short: 'S', total: 'T', totalName: 'Sets won', team: true };
// Placeholder six-player lineups: a team lists the same six in every match.
const teams = {
  'CSE Y3': ['CSE · Year 3', 'Aarav Bhatt', 'Kabir Sood', 'Rehan Malik', 'Ishan Goyal', 'Yuvan Sethi', 'Tanmay Arora'],
  'ECE Y2': ['ECE · Year 2', 'Pranav Kaul', 'Rudra Nair', 'Vihaan Dhillon', 'Shaurya Bains', 'Ayaan Chopra', 'Neel Saxena'],
  'Civil Y4': ['Civil · Year 4', 'Gagan Brar', 'Mohit Rathi', 'Sarthak Jain', 'Uday Pandey', 'Kartik Sahni', 'Lakshya Bedi'],
  'Chem Y1': ['Chemical · Year 1', 'Arjun Tiwari', 'Dhruv Kalia', 'Hardik Sinha', 'Jatin Ahuja', 'Om Mathur', 'Parv Khanna'],
  'Mech Y3': ['Mechanical · Year 3', 'Aditya Rawat', 'Chirag Mann', 'Devansh Puri', 'Eshan Grewal', 'Harshit Bajaj', 'Manan Oberoi'],
  'Mech Y1': ['Mechanical · Year 1', 'Lakshay Sandhu', 'Mayank Joshi', 'Nitin Chawla', 'Paras Gera', 'Rishabh Vohra', 'Sahil Anand'],
  'Elec Y1': ['Electrical · Year 1', 'Tejas Batra', 'Utkarsh Garg', 'Vedant Luthra', 'Yash Pal', 'Zubin Rao', 'Anmol Bhalla'],
  'Hostel A': ['Hostel A', 'Nakul Verma', 'Pratik Sharma', 'Raghav Tandon', 'Samar Gill', 'Tushar Kohli', 'Varun Dua'],
  'Hostel M': ['Hostel M', 'Akshay Mehra', 'Bhavya Suri', 'Darsh Kapoor', 'Gautam Rana', 'Jay Thakur', 'Kunal Sachdev'],
  'Mech Y2': ['Mechanical · Year 2', 'Aanya Gupta', 'Bhavna Kaur', 'Charu Mittal', 'Divya Ahluwalia', 'Esha Rawal', 'Gauri Sethi'],
  'Biotech Y3': ['Biotech · Year 3', 'Hina Qureshi', 'Ira Malhotra', 'Juhi Bansal', 'Kavya Dhawan', 'Lavanya Iyer', 'Meher Grover'],
  'CSE Y1': ['CSE · Year 1', 'Naina Kapoor', 'Ojasvi Rana', 'Prisha Lamba', 'Riddhi Khurana', 'Saanvi Bhatia', 'Tanvi Chadha'],
  'Elec Y3': ['Electrical · Year 3', 'Urvi Saini', 'Vanya Mehta', 'Yashika Arora', 'Zoya Khan', 'Aditi Sharma', 'Bani Dutta'],
  'ECE Y4': ['ECE · Year 4', 'Chhavi Narang', 'Disha Kohli', 'Fatima Ansari', 'Garima Jindal', 'Harleen Sodhi', 'Ishita Walia'],
  'Civil Y2': ['Civil · Year 2', 'Jiya Thapar', 'Kiran Mann', 'Lata Sehgal', 'Mahira Sood', 'Nidhi Sahni', 'Ritu Wadhwa'],
};
const side = (name, serving) => {
  const [team, ...players] = teams[name];
  return { name, team, ...(serving && { serving: true }), players: players.map(player => ({ name: player })) };
};
export const liveMatches = [
  {
    id: 'live-m-cse-ece', status: 'live', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '4:00 PM', venue: 'Volleyball Court 1', clock: 'Set 3 · 18–16',
    sides: [side('CSE Y3', true), side('ECE Y2')],
    periods: [{ points: [25, 20], winner: 0 }, { points: [23, 25], winner: 1 }, { points: [18, 16], current: true }, null, null],
    score: [1, 1], winner: null,
  },
  {
    id: 'live-w-mech-biotech', status: 'live', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '4:00 PM', venue: 'Volleyball Court 2', clock: 'Set 5 · 12–10',
    sides: [side('Mech Y2'), side('Biotech Y3', true)],
    periods: [{ points: [25, 22], winner: 0 }, { points: [22, 25], winner: 1 }, { points: [26, 24], winner: 0 }, { points: [19, 25], winner: 1 }, { points: [12, 10], current: true }],
    score: [2, 2], winner: null,
  },
  {
    id: 'live-m-civil-chem', status: 'ended', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 4',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '1:30 PM', venue: 'Volleyball Court 1', clock: null,
    sides: [side('Civil Y4'), side('Chem Y1')],
    periods: [{ points: [25, 21], winner: 0 }, { points: [20, 25], winner: 1 }, { points: [25, 23], winner: 0 }, { points: [21, 25], winner: 1 }, { points: [15, 13], winner: 0 }],
    score: [3, 2], winner: 0,
  },
];
export const upcomingMatches = [
  {
    id: 'up-w-cse-elec', status: 'scheduled', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '6:00 PM', venue: 'Volleyball Court 1',
    sides: [side('CSE Y1'), side('Elec Y3')],
  },
  {
    id: 'up-m-civil-mech', status: 'scheduled', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-11', dateLabel: '11 Oct', timeLabel: '4:00 PM', venue: 'Volleyball Court 1',
    sides: [side('Civil Y4'), side('Mech Y3')],
  },
  {
    id: 'up-m-hostel-a-m', status: 'scheduled', category: 'Men’s', tournament: 'Inter-Hostel Cup', round: 'Round 1',
    date: '2026-10-15', dateLabel: '15 Oct', timeLabel: '5:00 PM', venue: 'Hostel A Court',
    sides: [side('Hostel A'), side('Hostel M')],
  },
];
export const pastMatches = [
  {
    id: 'past-m-cse-mech', status: 'completed', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 1',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '5:00 PM', venue: 'Volleyball Court 1',
    sides: [side('CSE Y3'), side('Mech Y1')],
    periods: [{ points: [25, 19], winner: 0 }, { points: [25, 22], winner: 0 }, { points: [25, 17], winner: 0 }, null, null],
    score: [3, 0], winner: 0,
  },
  {
    id: 'past-w-ece-biotech', status: 'completed', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '3:30 PM', venue: 'Volleyball Court 2',
    sides: [side('ECE Y4'), side('Biotech Y3')],
    periods: [{ points: [22, 25], winner: 1 }, { points: [25, 20], winner: 0 }, { points: [18, 25], winner: 1 }, { points: [23, 25], winner: 1 }, null],
    score: [1, 3], winner: 1,
  },
  {
    id: 'past-m-ece-elec', status: 'completed', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-02', dateLabel: '2 Oct', timeLabel: '4:00 PM', venue: 'Volleyball Court 1',
    sides: [side('ECE Y2'), side('Elec Y1')],
    periods: [{ points: [25, 23], winner: 0 }, { points: [24, 26], winner: 1 }, { points: [25, 21], winner: 0 }, { points: [28, 26], winner: 0 }, null],
    score: [3, 1], winner: 0,
  },
  {
    id: 'past-w-civil-mech', status: 'completed', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 1',
    date: '2026-10-01', dateLabel: '1 Oct', timeLabel: '4:30 PM', venue: 'Volleyball Court 2',
    sides: [side('Civil Y2'), side('Mech Y2')],
    periods: [{ points: [25, 20], winner: 0 }, { points: [21, 25], winner: 1 }, { points: [25, 27], winner: 1 }, { points: [25, 19], winner: 0 }, { points: [13, 15], winner: 1 }],
    score: [2, 3], winner: 1,
  },
];
