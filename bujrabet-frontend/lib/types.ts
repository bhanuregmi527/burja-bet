export type SymbolKey = "heart" | "spade" | "diamond" | "club" | "crown" | "flag";

export type GamePhase = "lobby" | "rolling" | "show";

export type GameSymbol = {
  key: SymbolKey;
  label: string;
  accent: string;
  glow: string;
  icon: React.ReactNode;
};

export type Activity = {
  player: string;
  bet: string;
  wager: number;
  result: "win" | "loss";
};

export type ResultSummary = {
  matches: number;
  payoutMultiplier: number;
  payout: number;
};

