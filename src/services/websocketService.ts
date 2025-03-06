import WebSocket, { WebSocketServer } from 'ws';
import { Server } from 'http';

export class WebSocketService {
  private wss: WebSocketServer;

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.initialize();
  }

  private initialize(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection established');

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      ws.on('close', () => {
        console.log('WebSocket connection closed');
      });
    });
  }

  broadcast(message: any): void {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  handleMessage(ws: WebSocket, message: WebSocket.RawData) {
    try {
      const data = JSON.parse(message.toString());
      const { pollId, optionId } = data;
      console.log(`Received pollId: ${pollId}, optionId: ${optionId}`);

      ws.send(JSON.stringify({ status: 'success' }));
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({ status: 'error', message: 'Invalid message format' }));
    }
  }

  onMessage(callback: (ws: WebSocket, message: WebSocket.RawData) => void): void {
    this.wss.on('connection', (ws: WebSocket) => {
      ws.on('message', (message: WebSocket.RawData) => {
        callback(ws, message);
      });
    });
  }

  close(): void {
    this.wss.close();
  }
}
