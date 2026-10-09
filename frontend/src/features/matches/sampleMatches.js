// Display fixtures only: names, scores, clocks and breakdowns await sport-team integration.
// These values do not define a production scoring model or tournament rules.
export const sampleMatches = [
  {
    "id": "basketball",
    "sport": "basketball",
    "sportLabel": "Basketball",
    "competition": "Campus League",
    "score": "86–95",
    "clock": "Q4 · 02:49",
    "columns": [
      {
        "key": "0",
        "label": "Q1"
      },
      {
        "key": "1",
        "label": "Q2"
      },
      {
        "key": "2",
        "label": "Q3"
      },
      {
        "key": "3",
        "label": "Q4",
        "className": "is-current"
      },
      {
        "key": "4",
        "label": "T",
        "className": "match-total",
        "description": "Total"
      }
    ],
    "sides": [
      {
        "name": "Wolves",
        "values": [
          "19",
          "23",
          "24",
          "20",
          "86"
        ]
      },
      {
        "name": "Kings",
        "values": [
          "18",
          "28",
          "22",
          "27",
          "95"
        ]
      }
    ]
  },
  {
    "id": "football",
    "sport": "football",
    "sportLabel": "Football",
    "competition": "Campus League",
    "score": "2–1",
    "clock": "72′ · Second half",
    "columns": [
      {
        "key": "0",
        "label": "H1"
      },
      {
        "key": "1",
        "label": "H2",
        "className": "is-current"
      },
      {
        "key": "2",
        "label": "T",
        "className": "match-total",
        "description": "Total"
      }
    ],
    "sides": [
      {
        "name": "Eagles",
        "values": [
          "1",
          "1",
          "2"
        ]
      },
      {
        "name": "Falcons",
        "values": [
          "0",
          "1",
          "1"
        ]
      }
    ]
  },
  {
    "id": "lawn-tennis",
    "sport": "lawn-tennis",
    "sportLabel": "Tennis",
    "competition": "Men’s Singles",
    "score": "1–1",
    "clock": "Set 3 · 4–3",
    "columns": [
      {
        "key": "0",
        "label": "S1"
      },
      {
        "key": "1",
        "label": "S2"
      },
      {
        "key": "2",
        "label": "S3",
        "className": "is-current"
      },
      {
        "key": "3",
        "label": "Sets",
        "className": "match-total",
        "description": "Sets won"
      }
    ],
    "sides": [
      {
        "name": "Rao",
        "values": [
          "6",
          "3",
          "4",
          "1"
        ]
      },
      {
        "name": "Singh",
        "values": [
          "4",
          "6",
          "3",
          "1"
        ]
      }
    ]
  },
  {
    "id": "table-tennis",
    "sport": "table-tennis",
    "sportLabel": "Table Tennis",
    "competition": "Men’s Singles",
    "score": "2–1",
    "clock": "Game 4 · 7–5",
    "columns": [
      {
        "key": "0",
        "label": "G1"
      },
      {
        "key": "1",
        "label": "G2"
      },
      {
        "key": "2",
        "label": "G3"
      },
      {
        "key": "3",
        "label": "G4",
        "className": "is-current"
      },
      {
        "key": "4",
        "label": "T",
        "className": "match-total",
        "description": "Games won"
      }
    ],
    "sides": [
      {
        "name": "Sharma",
        "values": [
          "11",
          "9",
          "11",
          "7",
          "2"
        ]
      },
      {
        "name": "Gupta",
        "values": [
          "8",
          "11",
          "6",
          "5",
          "1"
        ]
      }
    ]
  },
  {
    "id": "badminton",
    "sport": "badminton",
    "sportLabel": "Badminton",
    "competition": "Men’s Singles",
    "score": "1–0",
    "clock": "Game 2 · 19–17",
    "columns": [
      {
        "key": "0",
        "label": "G1"
      },
      {
        "key": "1",
        "label": "G2",
        "className": "is-current"
      },
      {
        "key": "2",
        "label": "G3"
      },
      {
        "key": "3",
        "label": "T",
        "className": "match-total",
        "description": "Games won"
      }
    ],
    "sides": [
      {
        "name": "Iyer",
        "values": [
          "21",
          "19",
          "—",
          "1"
        ]
      },
      {
        "name": "Khan",
        "values": [
          "18",
          "17",
          "—",
          "0"
        ]
      }
    ]
  },
  {
    "id": "volleyball",
    "sport": "volleyball",
    "sportLabel": "Volleyball",
    "competition": "Campus League",
    "score": "1–1",
    "clock": "Set 3 · 18–16",
    "columns": [
      {
        "key": "0",
        "label": "S1"
      },
      {
        "key": "1",
        "label": "S2"
      },
      {
        "key": "2",
        "label": "S3",
        "className": "is-current"
      },
      {
        "key": "3",
        "label": "S4"
      },
      {
        "key": "4",
        "label": "S5"
      },
      {
        "key": "5",
        "label": "T",
        "className": "match-total",
        "description": "Sets won"
      }
    ],
    "sides": [
      {
        "name": "Storm",
        "values": [
          "25",
          "23",
          "18",
          "—",
          "—",
          "1"
        ]
      },
      {
        "name": "Blaze",
        "values": [
          "20",
          "25",
          "16",
          "—",
          "—",
          "1"
        ]
      }
    ]
  }
];
