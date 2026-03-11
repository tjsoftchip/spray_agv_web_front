import React from 'react';
import { Card, Badge, Progress, Tag, Tooltip } from 'antd';
import {
  CompassOutlined,
  CheckCircleOutlined,
  PauseCircleOutlined,
  LoadingOutlined,
  WarningOutlined
} from '@ant-design/icons';

interface NavigationStatusCardProps {
  mode: 'SPRAY_NAVIGATION' | 'GPS_NAVIGATION' | 'RESUPPLY_NAVIGATION' | 'IDLE' | string;
  status: 'executing' | 'paused' | 'waiting' | 'error' | 'idle' | string;
  currentTask?: string;
  currentBeamPosition?: string;
  progress?: number; // 0-100
  estimatedTimeRemaining?: number; // 秒
  errorMessage?: string;
}

const NavigationStatusCard: React.FC<NavigationStatusCardProps> = ({
  mode,
  status,
  currentTask,
  currentBeamPosition,
  progress = 0,
  estimatedTimeRemaining,
  errorMessage
}) => {
  // 模式显示配置
  const modeConfig: Record<string, { label: string; color: string }> = {
    'SPRAY_NAVIGATION': { label: '喷淋作业', color: 'blue' },
    'GPS_NAVIGATION': { label: 'GPS导航', color: 'green' },
    'RESUPPLY_NAVIGATION': { label: '补给导航', color: 'orange' },
    'IDLE': { label: '待机', color: 'default' }
  };

  // 状态显示配置
  const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    'executing': { label: '执行中', icon: <LoadingOutlined spin />, color: 'processing' },
    'paused': { label: '已暂停', icon: <PauseCircleOutlined />, color: 'warning' },
    'waiting': { label: '等待中', icon: <LoadingOutlined />, color: 'default' },
    'error': { label: '错误', icon: <WarningOutlined />, color: 'error' },
    'idle': { label: '空闲', icon: <CheckCircleOutlined />, color: 'success' }
  };

  const modeInfo = modeConfig[mode] || { label: mode, color: 'default' };
  const statusInfo = statusConfig[status] || { label: status, icon: null, color: 'default' };

  // 格式化剩余时间
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分钟`;
  };

  return (
    <Card 
      size="small"
      style={{ 
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        borderRadius: '8px',
        height: '100%',
        border: 'none'
      }}
    >
      <div>
        <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
          <CompassOutlined style={{ marginRight: 8 }} />
          导航状态
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
          <Tag color={modeInfo.color} style={{ marginRight: 8 }}>
            {modeInfo.label}
          </Tag>
          <Badge 
            status={statusInfo.color as any} 
            text={
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {statusInfo.icon}
                {statusInfo.label}
              </span>
            }
          />
        </div>

        {status === 'error' && errorMessage && (
          <div style={{ 
            marginBottom: '8px', 
            padding: '8px', 
            background: '#fff2f0', 
            borderRadius: '4px',
            fontSize: '12px',
            color: '#ff4d4f'
          }}>
            <WarningOutlined style={{ marginRight: 4 }} />
            {errorMessage}
          </div>
        )}

        {status === 'executing' && (
          <>
            <div style={{ marginBottom: '8px' }}>
              <Progress 
                percent={Math.round(progress)} 
                size="small" 
                status="active"
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
            </div>

            {currentTask && (
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                当前任务: {currentTask}
              </div>
            )}

            {currentBeamPosition && (
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>
                当前梁位: <Tag color="blue">{currentBeamPosition}</Tag>
              </div>
            )}

            {estimatedTimeRemaining && estimatedTimeRemaining > 0 && (
              <Tooltip title={`预计剩余 ${formatTime(estimatedTimeRemaining)}`}>
                <div style={{ fontSize: '12px', color: '#999' }}>
                  剩余时间: ~{formatTime(estimatedTimeRemaining)}
                </div>
              </Tooltip>
            )}
          </>
        )}

        {status === 'idle' && (
          <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
            系统空闲，等待任务指令
          </div>
        )}

        {status === 'paused' && (
          <div style={{ fontSize: '12px', color: '#999', marginTop: '8px' }}>
            任务已暂停，等待恢复指令
          </div>
        )}
      </div>
    </Card>
  );
};

export default NavigationStatusCard;
