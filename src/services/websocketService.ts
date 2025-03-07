import WebSocket from 'ws';
import { Server } from 'http';
import { LeaderboardResult } from '../models/poll';

export class WebSocketService {
  public wss: WebSocket.Server;

  constructor(server: Server) {
    this.wss = new WebSocket.Server({ server });
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection established');

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  broadcast(data: string): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  sendLeaderboardUpdate(leaderboard: LeaderboardResult): void {
    this.broadcast(JSON.stringify({
      type: 'LEADERBOARD_UPDATE',
      data: leaderboard
    }));
  }

  close(): void {
    this.wss.close();
  }
}
