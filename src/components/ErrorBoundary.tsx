import React, { Component, type ReactNode } from 'react';
import { Result, Button } from 'antd';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          minHeight: '100vh',
          padding: '20px'
        }}>
          <Result
            status="error"
            title="页面出错了"
            subTitle={
              import.meta.env.DEV 
                ? this.state.error?.message 
                : '抱歉，页面遇到了一些问题'
            }
            extra={[
              <Button type="primary" key="reload" onClick={this.handleReset}>
                重新加载
              </Button>,
              <Button key="home" onClick={() => window.location.href = '/'}>
                返回首页
              </Button>,
            ]}
          >
            {import.meta.env.DEV && this.state.errorInfo && (
              <details style={{ whiteSpace: 'pre-wrap', textAlign: 'left', marginTop: 20 }}>
                <summary style={{ cursor: 'pointer', marginBottom: 10 }}>
                  查看错误详情
                </summary>
                <pre style={{ 
                  background: '#f5f5f5', 
                  padding: 15, 
                  borderRadius: 4,
                  fontSize: 12,
                  overflow: 'auto'
                }}>
                  {this.state.error?.stack}
                  {'\n\n'}
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </Result>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
