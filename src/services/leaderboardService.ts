import { getAllPollResults } from "../config/database";

export class LeaderboardService {
  async getLeaderboard(): Promise<any> {
    const leaderboard = await getAllPollResults();
    return leaderboard;
  }
};
