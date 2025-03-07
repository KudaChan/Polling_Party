/** Data transfer object for creating a new vote */
export interface CreateVoteDTO {
  poll_id: string;
  user_id: string;
  option_id: string;
}

/** Represents a vote entity */
export interface Vote {
  id: string;
  poll_id: string;
  user_id: string;
  option_id: string;
  created_at: Date;
}