export interface CreateVoteDTO {
  pollId: string;
  optionId: string;
  userId: string;
}

export interface Vote {
  id: string;
  pollId: string;
  optionId: string;
  userId: string;
  createdAt: Date;
}