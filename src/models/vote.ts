export interface Vote {
  id: string;
  pollId: string;
  optionId: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VoteCounter {
  pollId: string;
  optionId: string;
  votesCount: number;
  updatedAt: Date;
}

export interface CreateVoteDTO {
  pollId: string;
  optionId: string;
  userId: string;
}

