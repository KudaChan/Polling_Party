import WebSocket, { WebSocketServer } from 'ws';

export class WebSocketService {
  private wss!: WebSocketServer;

  constructor(server: any) {
    this.wss = new WebSocketServer({ server });
    this.initialize();
  }

  private initialize(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('websocket connected');

      ws.on('close', () => {
        console.log('websocket disconnected');
      });
    });
  }

  broadcast (message: string): void {
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
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
    })
  }

  close(): void {
    this.wss.close();
  }
}
