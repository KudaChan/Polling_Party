import WebSocket from 'ws';
import { Server } from 'http';
import { LeaderboardResult } from '../models/poll';

/**
 * Service for managing WebSocket connections and broadcasting updates to connected clients
 */
export class WebSocketService {
  /** WebSocket server instance */
  public wss: WebSocket.Server;

  /**
   * Initializes the WebSocket server and sets up connection handling
   * @param server - HTTP server instance to attach the WebSocket server to
   */
  constructor(server: Server) {
    this.wss = new WebSocket.Server({ server });
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection established');

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  /**
   * Broadcasts data to all connected clients
   * @param data - String data to broadcast to all clients
   */
  broadcast(data: string): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /**
   * Sends leaderboard updates to all connected clients
   * @param leaderboard - Current leaderboard data to broadcast
   */
  sendLeaderboardUpdate(leaderboard: LeaderboardResult): void {
    this.broadcast(JSON.stringify({
      type: 'LEADERBOARD_UPDATE',
      data: leaderboard
    }));
  }

  /**
   * Closes the WebSocket server and terminates all connections
   */
  close(): void {
    this.wss.close();
  }
}
