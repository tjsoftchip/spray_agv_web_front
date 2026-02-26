import { io, Socket } from 'socket.io-client';

const getWsUrl = (): string => {
  const envUrl = import.meta.env.VITE_WS_URL;
  
  if (envUrl) {
    return envUrl;
  }
  
  // 动态使用当前页面的主机地址
  // 这样无论后端运行在哪个 IP 上，前端都能自动适应
  const hostname = window.location.hostname;
  const backendPort = '3000';
  
  // 开发环境：使用 HTTP 协议
  if (import.meta.env.DEV) {
    return `http://${hostname}:${backendPort}`;
  }
  
  // 生产环境：使用当前页面的协议
  return `${window.location.protocol}//${hostname}:${backendPort}`;
};

const WS_URL = getWsUrl();

class SocketService {
  private socket: Socket | null = null;
  private connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' = 'disconnected';
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private connectionRefCount = 0; // 连接引用计数

  public connect(): void {
    this.connectionRefCount++;

    if (this.socket?.connected) {
      return;
    }

    this.connectionStatus = 'connecting';

    this.socket = io(WS_URL, {
      transports: ['websocket', 'polling'], // 添加polling作为备用传输方式
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts,
      timeout: 20000, // 增加超时时间
      forceNew: true, // 强制创建新连接
      autoConnect: true
    });

    this.socket.on('connect', () => {
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
      // transports switching handled by socket.io internally
    });

    this.socket.on('disconnect', (reason) => {
      this.connectionStatus = 'disconnected';

      // 根据断开原因决定是否自动重连
      if (reason === 'io server disconnect') {
        // 服务器主动断开，需要手动重连
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      this.connectionStatus = 'reconnecting';
      this.reconnectAttempts++;

      // 如果是WebSocket连接失败，尝试使用polling
      if (this.socket && this.reconnectAttempts > 2) {
        this.socket.io.opts.transports = ['polling'] as any;
      }

      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Max reconnection attempts reached');
        this.connectionStatus = 'disconnected';
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      this.connectionStatus = 'connected';
      this.reconnectAttempts = 0;
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      this.connectionStatus = 'reconnecting';
    });

    this.socket.on('reconnect_failed', () => {
      console.error('Failed to reconnect after all attempts');
      this.connectionStatus = 'disconnected';
    });
  }

  public getConnectionStatus(): string {
    return this.connectionStatus;
  }

  public disconnect(): void {
    if (this.connectionRefCount > 0) {
      this.connectionRefCount--;
    }

    // 只有当引用计数为0时才真正断开连接
    if (this.connectionRefCount === 0 && this.socket) {
      this.stopHeartbeat();
      this.socket.disconnect();
      this.socket = null;
      this.connectionStatus = 'disconnected';
      this.reconnectAttempts = 0;
    }
  }

  // 发送心跳
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  
  public startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping');
      }
    }, 30000); // 每30秒发送一次心跳
  }
  
  public stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
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
