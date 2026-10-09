// Display fixtures only: names, scores, dates and venues await backend integration.
// Values follow the official FIBA baseline (four 10-minute quarters, 5-minute overtime when tied); the event format is open in doc/rules.md, so no completed fixture is a draw.
// periods: 4 quarter slots, null = not played, plus an OT slot only when Q1–Q4 are tied; winner = side with more points in that period (absent on a tie); current = period in progress.
// score = total points. scorers: the two top scorers per side.
export const scoring = { model: 'period', unit: 'Quarter', short: 'Q', total: 'T', totalName: 'Total points', team: true, scorers: 'Top scorers' };
// Placeholder five-player lineups: a team lists the same five in every match.
const teams = {
  'CSE Y3': ['CSE · Year 3', 'Arjun Bhatia', 'Kunal Arora', 'Sahil Mehra', 'Tanish Goyal', 'Vivaan Kapoor'],
  'ECE Y2': ['ECE · Year 2', 'Nikhil Rao', 'Dev Malik', 'Aakash Jain', 'Hriday Sethi', 'Parth Gulati'],
  'Civil Y4': ['Civil · Year 4', 'Rohan Bains', 'Amrit Sandhu', 'Gurkirat Gill', 'Manpreet Brar', 'Sunny Dhaliwal'],
  'Chem Y1': ['Chemical · Year 1', 'Aniket Joshi', 'Bharat Sood', 'Dhruv Saxena', 'Lalit Ahuja', 'Naman Tyagi'],
  'Mech Y1': ['Mechanical · Year 1', 'Ekansh Vohra', 'Himanshu Rawat', 'Kartikey Pal', 'Raghav Bhalla', 'Utsav Bindra'],
  'Mech Y3': ['Mechanical · Year 3', 'Abhay Chauhan', 'Daksh Grewal', 'Jayant Puri', 'Mridul Khanna', 'Sarthak Batra'],
  'Elec Y1': ['Electrical · Year 1', 'Ishaan Wadhwa', 'Keshav Bansal', 'Neeraj Sethi', 'Pranav Lamba', 'Ritvik Anand'],
  'Hostel A': ['Hostel A', 'Aditya Sahni', 'Chirag Bedi', 'Gautam Arora', 'Mayank Narula', 'Yash Talwar'],
  'Hostel M': ['Hostel M', 'Akhil Dhawan', 'Harmeet Singh', 'Kabir Uppal', 'Rishi Kalia', 'Vatsal Mehta'],
  'Mech Y2': ['Mechanical · Year 2', 'Ira Sharma', 'Kashish Gupta', 'Nandini Rao', 'Prachi Verma', 'Tanya Bhatt'],
  'Biotech Y3': ['Biotech · Year 3', 'Aditi Grover', 'Deepika Nair', 'Ishita Bajaj', 'Mira Khosla', 'Sonal Ahluwalia'],
  'CSE Y1': ['CSE · Year 1', 'Anvi Mittal', 'Gia Kohli', 'Kiara Sethi', 'Nyra Chopra', 'Ritika Jain'],
  'Elec Y3': ['Electrical · Year 3', 'Bhavika Arora', 'Esha Dutta', 'Jhanvi Goel', 'Mitali Rana', 'Shruti Pandey'],
  'ECE Y4': ['ECE · Year 4', 'Avneet Kaur', 'Damini Sood', 'Harnoor Gill', 'Lavisha Mehra', 'Raveena Thakur'],
  'Civil Y2': ['Civil · Year 2', 'Amaira Bedi', 'Chahat Malhotra', 'Jasleen Dhillon', 'Naina Bhasin', 'Suhani Kapur'],
};
const side = name => {
  const [team, ...players] = teams[name];
  return { name, team, players: players.map(player => ({ name: player })) };
};
const pts = (sideIndex, player, points) => ({ side: sideIndex, player, detail: `${points} pts` });
export const liveMatches = [
  {
    id: 'live-m-cse-ece', status: 'live', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '5:00 PM', venue: 'Indoor Court A', clock: 'Q3 · 04:12',
    sides: [side('CSE Y3'), side('ECE Y2')],
    periods: [{ points: [18, 15], winner: 0 }, { points: [14, 20], winner: 1 }, { points: [13, 9], current: true }, null],
    score: [45, 44], winner: null,
    scorers: [pts(0, 'Arjun Bhatia', 14), pts(0, 'Kunal Arora', 11), pts(1, 'Nikhil Rao', 16), pts(1, 'Dev Malik', 9)],
  },
  {
    id: 'live-w-mech-biotech', status: 'live', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '5:00 PM', venue: 'Indoor Court B', clock: 'OT · 02:30',
    sides: [side('Mech Y2'), side('Biotech Y3')],
    periods: [
      { points: [12, 14], winner: 1 }, { points: [15, 11], winner: 0 }, { points: [10, 13], winner: 1 }, { points: [16, 15], winner: 0 },
      { label: 'OT', name: 'Overtime', points: [4, 2], current: true },
    ],
    score: [57, 55], winner: null,
    scorers: [pts(0, 'Ira Sharma', 19), pts(0, 'Nandini Rao', 12), pts(1, 'Aditi Grover', 17), pts(1, 'Mira Khosla', 14)],
  },
  {
    id: 'live-m-civil-chem', status: 'ended', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 4',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '2:00 PM', venue: 'Indoor Court A', clock: null,
    sides: [side('Civil Y4'), side('Chem Y1')],
    periods: [{ points: [20, 17], winner: 0 }, { points: [16, 16] }, { points: [15, 19], winner: 1 }, { points: [21, 18], winner: 0 }],
    score: [72, 70], winner: 0,
    scorers: [pts(0, 'Rohan Bains', 24), pts(0, 'Gurkirat Gill', 15), pts(1, 'Dhruv Saxena', 22), pts(1, 'Aniket Joshi', 18)],
  },
];
export const upcomingMatches = [
  {
    id: 'up-w-cse-elec', status: 'scheduled', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '6:30 PM', venue: 'Indoor Court A',
    sides: [side('CSE Y1'), side('Elec Y3')],
  },
  {
    id: 'up-m-civil-mech', status: 'scheduled', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-11', dateLabel: '11 Oct', timeLabel: '5:00 PM', venue: 'Indoor Court A',
    sides: [side('Civil Y4'), side('Mech Y3')],
  },
  {
    id: 'up-m-hostel-a-m', status: 'scheduled', category: 'Men’s', tournament: 'Inter-Hostel Cup', round: 'Round 1',
    date: '2026-10-15', dateLabel: '15 Oct', timeLabel: '6:00 PM', venue: 'Hostel Court',
    sides: [side('Hostel A'), side('Hostel M')],
  },
];
export const pastMatches = [
  {
    id: 'past-m-cse-mech', status: 'completed', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 1',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '5:30 PM', venue: 'Indoor Court A',
    sides: [side('CSE Y3'), side('Mech Y1')],
    periods: [{ points: [22, 18], winner: 0 }, { points: [19, 21], winner: 1 }, { points: [24, 15], winner: 0 }, { points: [17, 20], winner: 1 }],
    score: [82, 74], winner: 0,
    scorers: [pts(0, 'Arjun Bhatia', 26), pts(0, 'Sahil Mehra', 18), pts(1, 'Ekansh Vohra', 21), pts(1, 'Raghav Bhalla', 17)],
  },
  {
    id: 'past-w-ece-biotech', status: 'completed', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '4:00 PM', venue: 'Indoor Court B',
    sides: [side('ECE Y4'), side('Biotech Y3')],
    periods: [{ points: [14, 19], winner: 1 }, { points: [18, 18] }, { points: [16, 21], winner: 1 }, { points: [20, 17], winner: 0 }],
    score: [68, 75], winner: 1,
    scorers: [pts(0, 'Avneet Kaur', 20), pts(0, 'Harnoor Gill', 15), pts(1, 'Aditi Grover', 23), pts(1, 'Deepika Nair', 16)],
  },
  {
    id: 'past-m-ece-elec', status: 'completed', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-02', dateLabel: '2 Oct', timeLabel: '5:00 PM', venue: 'Indoor Court A',
    sides: [side('ECE Y2'), side('Elec Y1')],
    periods: [
      { points: [17, 15], winner: 0 }, { points: [13, 18], winner: 1 }, { points: [19, 16], winner: 0 }, { points: [15, 15] },
      { label: 'OT', name: 'Overtime', points: [9, 6], winner: 0 },
    ],
    score: [73, 70], winner: 0,
    scorers: [pts(0, 'Nikhil Rao', 25), pts(0, 'Dev Malik', 14), pts(1, 'Keshav Bansal', 22), pts(1, 'Ishaan Wadhwa', 13)],
  },
  {
    id: 'past-w-civil-mech', status: 'completed', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 1',
    date: '2026-10-01', dateLabel: '1 Oct', timeLabel: '5:00 PM', venue: 'Indoor Court B',
    sides: [side('Civil Y2'), side('Mech Y2')],
    periods: [{ points: [11, 16], winner: 1 }, { points: [15, 14], winner: 0 }, { points: [12, 19], winner: 1 }, { points: [18, 13], winner: 0 }],
    score: [56, 62], winner: 1,
    scorers: [pts(0, 'Jasleen Dhillon', 18), pts(0, 'Amaira Bedi', 12), pts(1, 'Ira Sharma', 21), pts(1, 'Kashish Gupta', 15)],
  },
];
