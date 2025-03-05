import { insertIntoVoteTable, TableNames} from "../config/database";
import { CreateVoteDTO } from "../models/vote";
import { KafkaService } from "./kafkaService";

export class VoteService {
  private kafkaService: KafkaService;

  constructor(kafkaService: KafkaService) {
    this.kafkaService = kafkaService;
  }

  async recordVote(voteData: CreateVoteDTO): Promise<any> {
    const result = await insertIntoVoteTable(TableNames.VOTES, voteData);
    await this.kafkaService.producerMessage('polling-updates', JSON.stringify(voteData));
    return result;
  }

  
}