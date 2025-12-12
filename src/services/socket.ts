import { io, Socket } from 'socket.io-client';

const getWsUrl = (): string => {
  const envUrl = import.meta.env.VITE_WS_URL;
  
  if (envUrl) {
    return envUrl;
  }
  
  return `${window.location.protocol}//${window.location.hostname}:3000`;
};

const WS_URL = getWsUrl();

class SocketService {
  private socket: Socket | null = null;

  public connect(): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(WS_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  public on(event: string, callback: (data: any) => void): void {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  public off(event: string, callback?: (data: any) => void): void {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  public emit(event: string, data: any): void {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  public sendRosCommand(command: any): void {
    this.emit('ros_command', command);
  }

  public onRosMessage(callback: (data: any) => void): void {
    this.on('ros_message', callback);
  }
}

export const socketService = new SocketService();
