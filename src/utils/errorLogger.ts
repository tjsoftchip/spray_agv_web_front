interface ErrorLog {
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: string;
  userAgent: string;
  url: string;
}

class ErrorLogger {
  private endpoint: string;
  private queue: ErrorLog[] = [];
  private maxQueueSize: number = 10;

  constructor() {
    const getEndpoint = (): string => {
      // 使用相对路径通过Vite代理，避免CORS问题
      return '/api/system/logs/client-error';
    };
    
    this.endpoint = getEndpoint();
    this.setupGlobalErrorHandler();
  }

  private setupGlobalErrorHandler(): void {
    window.addEventListener('error', (event) => {
      this.logError({
        message: event.message,
        stack: event.error?.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.logError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      });
    });
  }

  public logError(error: Partial<ErrorLog>): void {
    const errorLog: ErrorLog = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      componentStack: error.componentStack,
      timestamp: error.timestamp || new Date().toISOString(),
      userAgent: error.userAgent || navigator.userAgent,
      url: error.url || window.location.href,
    };

    console.error('Error logged:', errorLog);

    this.queue.push(errorLog);
    if (this.queue.length >= this.maxQueueSize) {
      this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const logs = [...this.queue];
    this.queue = [];

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ errors: logs }),
      });
    } catch (error) {
      console.error('Failed to send error logs:', error);
      this.queue.unshift(...logs);
    }
  }

  public flushNow(): void {
    this.flush();
  }
}

export const errorLogger = new ErrorLogger();
