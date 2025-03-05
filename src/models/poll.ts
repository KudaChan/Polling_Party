export interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: number;
  createdAt: Date;
  updatedAt: Date;
  expiredAt: Date;
  remark: string;
}

export interface Option {
  id: string;
  pollId: string;
  text: string;
  votes: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePollDTO {
  question: string;
  options: string[];
  expiredAt: Date;
  remark: string;
}
