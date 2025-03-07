export interface CreateVoteDTO {
  poll_id: string;
  user_id: string;
  option_id: string;
}

export interface Vote {
  id: string;
  poll_id: string;
  user_id: string;
  option_id: string;
  created_at: Date;
}