import React from 'react';
import { Card, Tag, Progress, Space, Tooltip } from 'antd';
import { 
  EnvironmentOutlined, 
  SignalFilled,
  CheckCircleFilled,
  WarningFilled,
  CloseCircleFilled
} from '@ant-design/icons';

interface GPSStatusCardProps {
  quality: number;           // 0-8 GPS质量: 0=无效, 1=SPS, 2=DGPS, 3=PPS, 4=Fixed, 5=Float, 6=DR, 7=手动, 8=模拟
  satellites: number;        // 卫星数量
  hdop: number;              // HDOP值
  latitude?: number;         // 纬度
  longitude?: number;        // 经度
  altitude?: number;         // 海拔
  heading?: number;          // 航向角
  speed?: number;            // 速度 m/s
  isFixed: boolean;          // 是否FIXED状态
  lastUpdate?: string;       // 最后更新时间
}

const GPSStatusCard: React.FC<GPSStatusCardProps> = ({
  quality,
  satellites,
  hdop,
  latitude,
  longitude,
  altitude,
  heading,
  speed,
  isFixed,
  lastUpdate
}) => {
  // 获取GPS质量状态（根据官方手册）
  // 0=无效, 1=定位有效, 2=差分有效, 3=PPS, 4=RTK固定, 5=RTK浮动, 6=估算, 7=手动, 8=模拟
  const getQualityInfo = (q: number) => {
    switch (q) {
      case 4: // RTK Fixed - 厘米级精度，导航可靠
        return { text: 'RTK Fixed', color: 'success', icon: <CheckCircleFilled />, precision: '厘米级', reliable: true };
      case 5: // RTK Float - 分米级精度，可限速导航
        return { text: 'RTK Float', color: 'warning', icon: <WarningFilled />, precision: '分米级', reliable: true };
      case 6: // DR - 估算模式，精度不可靠
        return { text: 'DR估算', color: 'warning', icon: <WarningFilled />, precision: '估算', reliable: false };
      case 3: // PPS模式
        return { text: 'PPS', color: 'processing', icon: <SignalFilled />, precision: '~1m', reliable: false };
      case 2: // DGPS - 差分定位
        return { text: 'DGPS', color: 'processing', icon: <SignalFilled />, precision: '~1m', reliable: false };
      case 1: // SPS - 单点定位
        return { text: 'SPS', color: 'default', icon: <SignalFilled />, precision: '~10m', reliable: false };
      case 7: // 手动输入
        return { text: '手动输入', color: 'error', icon: <CloseCircleFilled />, precision: '-', reliable: false };
      case 8: // 模拟器
        return { text: '模拟器', color: 'error', icon: <CloseCircleFilled />, precision: '-', reliable: false };
      default: // 0=无效或其他
        return { text: '无效', color: 'error', icon: <CloseCircleFilled />, precision: '-', reliable: false };
    }
  };

  const qualityInfo = getQualityInfo(quality);

  // 获取信号强度百分比
  const getSignalPercent = () => {
    if (satellites >= 20) return 100;
    if (satellites >= 15) return 80;
    if (satellites >= 10) return 60;
    if (satellites >= 6) return 40;
    return 20;
  };

  return (
    <Card 
      size="small" 
      title={
        <Space>
          <EnvironmentOutlined />
          <span>GPS状态</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="small">
        {/* GPS质量标签 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>定位状态:</span>
          <Tag color={qualityInfo.color} icon={qualityInfo.icon}>
            {qualityInfo.text}
          </Tag>
        </div>

        {/* 精度说明 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>定位精度:</span>
          <span style={{ color: qualityInfo.reliable ? '#52c41a' : '#faad14' }}>
            {qualityInfo.precision} {qualityInfo.reliable ? '✓' : '⚠'}
          </span>
        </div>

        {/* 卫星数量 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>卫星数量:</span>
          <Space>
            <Progress 
              percent={getSignalPercent()} 
              size="small" 
              style={{ width: 80 }}
              showInfo={false}
              strokeColor={satellites >= 10 ? '#52c41a' : satellites >= 6 ? '#faad14' : '#ff4d4f'}
            />
            <span>{satellites}</span>
          </Space>
        </div>

        {/* HDOP */}
        <Tooltip title="水平精度因子，越小越好（<2为优秀，<5为良好）">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>HDOP:</span>
            <span style={{ 
              color: hdop < 2 ? '#52c41a' : hdop < 5 ? '#faad14' : '#ff4d4f' 
            }}>
              {hdop.toFixed(2)}
            </span>
          </div>
        </Tooltip>

        {/* 坐标信息 */}
        {latitude !== undefined && longitude !== undefined && (
          <>
            <div style={{ 
              padding: '8px', 
              background: '#f5f5f5', 
              borderRadius: 4,
              fontSize: '12px'
            }}>
              <div>纬度: {latitude.toFixed(7)}°</div>
              <div>经度: {longitude.toFixed(7)}°</div>
              {altitude !== undefined && <div>海拔: {altitude.toFixed(2)} m</div>}
            </div>
          </>
        )}

        {/* 航向和速度 */}
        {(heading !== undefined || speed !== undefined) && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {heading !== undefined && (
              <span>航向: {heading.toFixed(1)}°</span>
            )}
            {speed !== undefined && (
              <span>速度: {speed.toFixed(2)} m/s</span>
            )}
          </div>
        )}

        {/* 最后更新时间 */}
        {lastUpdate && (
          <div style={{ fontSize: '12px', color: '#999', textAlign: 'right' }}>
            更新于: {lastUpdate}
          </div>
        )}
      </Space>
    </Card>
  );
};

export default GPSStatusCard;
