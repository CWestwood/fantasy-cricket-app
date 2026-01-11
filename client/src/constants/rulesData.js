// constants/rulesData.js
export const BATTING_POINTS = [
  { action: "Per Run", points: 1 },
  { action: "Per 6 Hit", points: 5 },
  { action: "Score 30+", points: 10 },
  { action: "Score 50+", points: 25 },
  { action: "Score 100+", points: 50 },
  { action: "Duck (0 runs)", points: -10 },
];

export const BOWLING_POINTS = [
  { action: "Per Wicket", points: 15 },
  { action: "Per Dot Ball", points: 3 },
  { action: "Per Maiden Over", points: 15 },
  { action: "3+ Wickets", points: 30 },
  { action: "5+ Wickets", points: 75 },
];

// ... add other categories similarly