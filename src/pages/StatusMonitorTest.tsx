import React from 'react';
import { Card, Alert, Space } from 'antd';
import StatusMonitor from './StatusMonitor';

const StatusMonitorTest: React.FC = () => {
  return (
    <div style={{ padding: '16px' }}>
      <Alert
        message="状态监控页面测试"
        description="这是一个综合性的状态监控页面，合并了以下功能："
        type="info"
        showIcon
        style={{ marginBottom: '16px' }}
      />
      
      <Space direction="vertical" size="small" style={{ width: '100%', marginBottom: '16px' }}>
        <Card size="small" title="功能说明">
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
            <li>✅ 实时状态监控（电池、水位、速度、任务状态）</li>
            <li>✅ 机器人位置信息直接显示</li>
            <li>✅ 导航状态监控和控制（暂停、恢复、停止）</li>
            <li>✅ 障碍物检测（激光雷达和深度相机）</li>
            <li>✅ 彩色相机图像预览</li>
            <li>✅ 地图显示（使用系统默认地图）</li>
            <li>✅ 电池和水位图表监控</li>
            <li>✅ 紧凑美观的布局设计</li>
          </ul>
        </Card>
        
        <Card size="small" title="技术改进">
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
            <li>🔧 修复ROS2速度话题：从 /odom_raw 改为 /vel_raw</li>
            <li>🔧 使用几何消息类型：geometry_msgs/Twist</li>
            <li>🔧 集成相机图像话题：/camera/image_raw</li>
            <li>🔧 优化布局：更紧凑的设计，更好的空间利用</li>
            <li>🔧 统一页面名称：从"实时监控"改为"状态监控"</li>
          </ul>
        </Card>
      </Space>
      
      <StatusMonitor />
    </div>
  );
};

export default StatusMonitorTest;
