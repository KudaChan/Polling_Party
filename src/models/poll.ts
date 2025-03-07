export interface CreatePollDTO {
  question: string;
  options: string[]
  expired_at: Date;
}

export interface Poll {
  id: string;
  question: string;
  expired_at: Date;
  created_at: Date;
}

export interface Option {
  id: string;
  poll_id: string;
  option_text: string;
  created_at: Date;
}

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

export interface LeaderboardOption {
  poll_id: string;
  poll_question: string;
  option_id: string;
  option_text: string;
  vote_count: number;
}

export interface LeaderboardResult {
  data: LeaderboardOption[];
  timestamp: string;
}
