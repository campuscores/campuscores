// Display fixtures only: names, scores, dates and venues await backend integration.
// Values follow the official IFAB baseline (two halves); duration, team size and knockout tie resolution are open in doc/rules.md, so no completed fixture is a draw.
// periods: 2 half slots, null = not played; winner = side with more goals in that half (absent on a tie); current = half in progress. score = total goals.
// scorers: goals in time order; detail = match minute.
export const scoring = { model: 'period', unit: 'Half', short: 'H', total: 'Goals', totalName: 'Total goals', team: true, scorers: 'Goals' };
// Placeholder five-player lineups: a team lists the same five in every match.
const teams = {
  'CSE Y3': ['CSE · Year 3', 'Aman Gill', 'Rohit Saini', 'Harsh Vaid', 'Ishaan Kohli', 'Manav Dutt'],
  'ECE Y2': ['ECE · Year 2', 'Kabir Sethi', 'Arnav Bedi', 'Siddhant Rao', 'Yuvraj Chhabra', 'Pranay Lal'],
  'Civil Y4': ['Civil · Year 4', 'Deepak Negi', 'Vikas Rana', 'Gurpreet Sandhu', 'Nitesh Bisht', 'Rahul Thapa'],
  'Chem Y1': ['Chemical · Year 1', 'Yash Rawal', 'Ankit Dogra', 'Mehul Sharma', 'Rajat Kalra', 'Sumit Gaur'],
  'Mech Y1': ['Mechanical · Year 1', 'Varun Bhalla', 'Abhinav Sood', 'Jatin Mehta', 'Ritik Singla', 'Tarun Ghai'],
  'Mech Y3': ['Mechanical · Year 3', 'Kunal Bajwa', 'Aryan Mahajan', 'Dev Khatri', 'Nikhil Arora', 'Pulkit Jain'],
  'Elec Y1': ['Electrical · Year 1', 'Aditya Ranjan', 'Harshit Goel', 'Karan Sahota', 'Mohit Bansal', 'Shivam Verma'],
  'Hostel A': ['Hostel A', 'Angad Brar', 'Chetan Kumar', 'Lakshit Rawat', 'Parth Chauhan', 'Vansh Khurana'],
  'Hostel M': ['Hostel M', 'Ayush Pathak', 'Gaurav Mann', 'Jai Saluja', 'Rohan Bhatt', 'Udit Sehgal'],
  'Mech Y2': ['Mechanical · Year 2', 'Simran Dhillon', 'Aisha Kapoor', 'Bhumi Arora', 'Kritika Jha', 'Mansi Rathore'],
  'Biotech Y3': ['Biotech · Year 3', 'Sana Mir', 'Ananya Bose', 'Gunjan Talwar', 'Pihu Agarwal', 'Ruhi Batra'],
  'CSE Y1': ['CSE · Year 1', 'Avni Chawla', 'Diya Sethi', 'Isha Bedi', 'Mehak Gill', 'Sneha Rao'],
  'Elec Y3': ['Electrical · Year 3', 'Anjali Nanda', 'Harshita Puri', 'Komal Dua', 'Nisha Garg', 'Tara Sood'],
  'ECE Y4': ['ECE · Year 4', 'Bhavya Taneja', 'Gurleen Kaur', 'Jasmine Oberoi', 'Muskan Sachdeva', 'Riya Malik'],
  'Civil Y2': ['Civil · Year 2', 'Aarohi Singh', 'Charvi Bhasin', 'Navya Grover', 'Pallavi Thakur', 'Sakshi Dang'],
};
const side = name => {
  const [team, ...players] = teams[name];
  return { name, team, players: players.map(player => ({ name: player })) };
};
export const liveMatches = [
  {
    id: 'live-m-cse-ece', status: 'live', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '4:00 PM', venue: 'Main Ground', clock: '62′ · Second half',
    sides: [side('CSE Y3'), side('ECE Y2')],
    periods: [{ points: [1, 0], winner: 0 }, { points: [1, 1], current: true }],
    score: [2, 1], winner: null,
    scorers: [{ side: 0, player: 'Aman Gill', detail: '23′' }, { side: 0, player: 'Rohit Saini', detail: '51′' }, { side: 1, player: 'Kabir Sethi', detail: '58′' }],
  },
  {
    id: 'live-w-mech-biotech', status: 'live', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '4:30 PM', venue: 'Practice Ground', clock: '38′ · First half',
    sides: [side('Mech Y2'), side('Biotech Y3')],
    periods: [{ points: [0, 1], current: true }, null],
    score: [0, 1], winner: null,
    scorers: [{ side: 1, player: 'Sana Mir', detail: '31′' }],
  },
  {
    id: 'live-m-civil-chem', status: 'ended', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 4',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '1:30 PM', venue: 'Main Ground', clock: null,
    sides: [side('Civil Y4'), side('Chem Y1')],
    periods: [{ points: [0, 1], winner: 1 }, { points: [2, 0], winner: 0 }],
    score: [2, 1], winner: 0,
    scorers: [{ side: 1, player: 'Yash Rawal', detail: '17′' }, { side: 0, player: 'Deepak Negi', detail: '55′' }, { side: 0, player: 'Vikas Rana', detail: '78′ (pen)' }],
  },
];
export const upcomingMatches = [
  {
    id: 'up-w-cse-elec', status: 'scheduled', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 1',
    date: '2026-10-10', dateLabel: '10 Oct', timeLabel: '6:00 PM', venue: 'Main Ground',
    sides: [side('CSE Y1'), side('Elec Y3')],
  },
  {
    id: 'up-m-civil-mech', status: 'scheduled', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Semifinal 2',
    date: '2026-10-11', dateLabel: '11 Oct', timeLabel: '4:00 PM', venue: 'Main Ground',
    sides: [side('Civil Y4'), side('Mech Y3')],
  },
  {
    id: 'up-m-hostel-a-m', status: 'scheduled', category: 'Men’s', tournament: 'Inter-Hostel Cup', round: 'Round 1',
    date: '2026-10-15', dateLabel: '15 Oct', timeLabel: '5:00 PM', venue: 'Hostel Ground',
    sides: [side('Hostel A'), side('Hostel M')],
  },
];
export const pastMatches = [
  {
    id: 'past-m-cse-mech', status: 'completed', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 1',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '5:00 PM', venue: 'Main Ground',
    sides: [side('CSE Y3'), side('Mech Y1')],
    periods: [{ points: [2, 0], winner: 0 }, { points: [1, 1] }],
    score: [3, 1], winner: 0,
    scorers: [{ side: 0, player: 'Aman Gill', detail: '12′' }, { side: 0, player: 'Harsh Vaid', detail: '40′' }, { side: 0, player: 'Rohit Saini', detail: '67′' }, { side: 1, player: 'Varun Bhalla', detail: '81′' }],
  },
  {
    id: 'past-w-ece-biotech', status: 'completed', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-03', dateLabel: '3 Oct', timeLabel: '3:00 PM', venue: 'Practice Ground',
    sides: [side('ECE Y4'), side('Biotech Y3')],
    periods: [{ points: [0, 0] }, { points: [0, 1], winner: 1 }],
    score: [0, 1], winner: 1,
    scorers: [{ side: 1, player: 'Sana Mir', detail: '73′' }],
  },
  {
    id: 'past-m-ece-elec', status: 'completed', category: 'Men’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 2',
    date: '2026-10-02', dateLabel: '2 Oct', timeLabel: '4:00 PM', venue: 'Main Ground',
    sides: [side('ECE Y2'), side('Elec Y1')],
    periods: [{ points: [1, 2], winner: 1 }, { points: [2, 0], winner: 0 }],
    score: [3, 2], winner: 0,
    scorers: [
      { side: 0, player: 'Kabir Sethi', detail: '9′' }, { side: 1, player: 'Aditya Ranjan', detail: '21′' }, { side: 1, player: 'Karan Sahota', detail: '44′' },
      { side: 0, player: 'Arnav Bedi', detail: '60′' }, { side: 0, player: 'Kabir Sethi', detail: '88′' },
    ],
  },
  {
    id: 'past-w-civil-mech', status: 'completed', category: 'Women’s', tournament: 'Thaparlympics 2026', round: 'Quarterfinal 1',
    date: '2026-10-01', dateLabel: '1 Oct', timeLabel: '4:30 PM', venue: 'Practice Ground',
    sides: [side('Civil Y2'), side('Mech Y2')],
    periods: [{ points: [0, 1], winner: 1 }, { points: [1, 2], winner: 1 }],
    score: [1, 3], winner: 1,
    scorers: [
      { side: 1, player: 'Simran Dhillon', detail: '30′' }, { side: 0, player: 'Navya Grover', detail: '52′ (pen)' },
      { side: 1, player: 'Aisha Kapoor', detail: '64′' }, { side: 1, player: 'Simran Dhillon', detail: '90+2′' },
    ],
  },
];
