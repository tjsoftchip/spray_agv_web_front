import React from 'react';
import { Spin, Skeleton } from 'antd';
import { LoadingOutlined } from '@ant-design/icons';

interface LoadingProps {
  size?: 'small' | 'default' | 'large';
  tip?: string;
  fullscreen?: boolean;
  type?: 'spin' | 'skeleton';
  rows?: number;
}

const Loading: React.FC<LoadingProps> = ({ 
  size = 'default', 
  tip, 
  fullscreen = false,
  type = 'spin',
  rows = 4
}) => {
  const antIcon = <LoadingOutlined style={{ fontSize: size === 'large' ? 48 : size === 'small' ? 16 : 24 }} spin />;

  if (type === 'skeleton') {
    return (
      <div style={{ padding: fullscreen ? '20px' : '0' }}>
        <Skeleton active paragraph={{ rows }} />
      </div>
    );
  }

  if (fullscreen) {
    return (
      <Spin 
        indicator={antIcon} 
        size={size} 
        tip={tip}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          width: '100%',
        }} />
      </Spin>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '40px 0',
      width: '100%',
    }}>
      <Spin indicator={antIcon} size={size} />
    </div>
  );
};

export default Loading;
