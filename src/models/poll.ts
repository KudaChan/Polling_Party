/** Data transfer object for creating a new poll */
export interface CreatePollDTO {
  question: string;
  options: string[]
  expired_at: Date;
}

/** Represents a poll entity */
export interface Poll {
  id: string;
  question: string;
  expired_at: Date;
  created_at: Date;
}

/** Represents a poll option entity */
export interface Option {
  id: string;
  poll_id: string;
  option_text: string;
  created_at: Date;
}

/** Represents the results of a poll including vote counts */
export interface PollResult {
  id: string;
  question: string;
  total_votes: number;
  options: {
    option_id: string;
    option_text: string;
    vote_count: number;
  }[];
  created_at: Date;
  expired_at: Date;
}

/** Represents an option in the leaderboard */
export interface LeaderboardOption {
  poll_id: string;
  poll_question: string;
  option_id: string;
  option_text: string;
  vote_count: number;
}

/** Represents the current state of the leaderboard */
export interface LeaderboardResult {
  data: LeaderboardOption[];
  timestamp: string;
}
