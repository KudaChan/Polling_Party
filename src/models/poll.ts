export interface CreatePollDTO {
  question: string;
  options: string[];
  expiredAt: Date;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  votes: number;
  expiredAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PollOption {
  id: string;
  pollId: string;
  text: string;
  votes: number;
  createdAt: Date;
}

export interface PollResult {
  id: string;
  question: string;
  totalVotes: number;
  options: {
    id: string;
    text: string;
    votes: number;
    percentage: number;
  }[];
  createdAt: Date;
  expiredAt: Date;
}



