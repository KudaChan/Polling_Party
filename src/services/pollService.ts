import { getPollResultById, insertIntoPollTable, TableNames } from "../config/database";
import { CreatePollDTO } from "../models/poll";

export class PollService {
  async createPoll(poll: CreatePollDTO) : Promise<any> {
    await insertIntoPollTable(TableNames.POLLS, poll);
  };

  async getPollResult(pollId: string): Promise<any> {
    const pollResult = await getPollResultById(pollId);
    return pollResult;
  }
}