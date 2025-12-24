import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Tag, Progress, Tabs, Table, Alert, Space, message, Spin } from 'antd';
import { 
  ReloadOutlined, 
  SettingOutlined, 
  PlayCircleOutlined,
  PauseCircleOutlined,
  PoweroffOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { systemApi } from '../services/systemApi';

// 直接定义接口，避免导入问题
interface SystemStatus {
  mode: 'idle' | 'mapping' | 'navigation' | 'supply' | 'unknown';
  basicServices: {
    chassis: boolean;
    cmdVelMux: boolean;
    rosbridge: boolean;
    webBackend: boolean;
    webFrontend: boolean;
    systemMonitor: boolean;
  };
  functionalNodes: {
    mapping: Record<string, any>;
    navigation: Record<string, any>;
    supply: Record<string, any>;
    sensors: {
      camera: Record<string, any>;
      lidar: Record<string, any>;
      webVideo: Record<string, any>;
    };
  };
  lastModeChange: string;
  uptime: string;
  hostname?: string;
}



const SystemMonitor: React.FC = () => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('status');

  // 获取系统状态
  const fetchSystemStatus = async () => {
    try {
      setLoading(true);
      const response = await systemApi.getSystemStatus();
      console.log('API Response:', response);
      setSystemStatus(response);
    } catch (error) {
      console.error('Failed to fetch system status:', error);
      message.error('获取系统状态失败');
    } finally {
      setLoading(false);
    }
  };

  // 切换系统模式
  const handleSwitchMode = async (mode: 'idle' | 'mapping' | 'navigation' | 'supply') => {
    try {
      setLoading(true);
      await systemApi.switchMode(mode);
      message.success(`正在切换到${getModeName(mode)}模式`);
      // 等待一段时间后刷新状态
      setTimeout(fetchSystemStatus, 3000);
    } catch (error) {
      console.error('Failed to switch mode:', error);
      message.error('切换模式失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取模式名称
  const getModeName = (mode: string) => {
    const modeNames = {
      idle: '待机',
      mapping: '建图',
      navigation: '导航',
      supply: '补给'
    };
    return modeNames[mode as keyof typeof modeNames] || mode;
  };

  // 获取模式颜色
  const getModeColor = (mode: string) => {
    const modeColors = {
      idle: 'default',
      mapping: 'processing',
      navigation: 'success',
      supply: 'warning'
    };
    return modeColors[mode as keyof typeof modeColors] || 'default';
  };

  // 组件挂载时获取状态
  useEffect(() => {
    console.log('SystemMonitor component mounted');
    fetchSystemStatus();
    // 设置定时刷新
    const interval = setInterval(fetchSystemStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    console.log('SystemMonitor systemStatus updated:', systemStatus);
  }, [systemStatus]);

  if (!systemStatus) {
    console.log('SystemMonitor: No systemStatus, showing loading');
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
        <p>正在加载系统状态...</p>
      </div>
    );
  }

  console.log('SystemMonitor: Rendering with systemStatus:', systemStatus);

  // 基础服务状态表格
  const basicServicesColumns = [
    {
      title: '服务',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: boolean) => (
        <Tag color={status ? 'success' : 'error'}>
          {status ? '运行中' : '已停止'}
        </Tag>
      ),
    },
  ];

  const basicServicesData = [
    { key: 'chassis', name: '底盘控制', status: systemStatus.basicServices.chassis },
    { key: 'cmdVelMux', name: '命令管理器', status: systemStatus.basicServices.cmdVelMux },
    { key: 'rosbridge', name: 'rosbridge', status: systemStatus.basicServices.rosbridge },
    { key: 'webBackend', name: 'Web后端', status: systemStatus.basicServices.webBackend },
    { key: 'webFrontend', name: 'Web前端', status: systemStatus.basicServices.webFrontend },
    { key: 'systemMonitor', name: '系统监控', status: systemStatus.basicServices.systemMonitor },
  ];

  // 功能节点状态表格
  const functionalNodesColumns = [
    {
      title: '节点',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: boolean) => (
        <Tag color={status ? 'success' : 'error'}>
          {status ? '运行中' : '已停止'}
        </Tag>
      ),
    },
  ];

  const functionalNodesData = [
    { key: 'mapping', name: '建图系统', status: Object.keys(systemStatus.functionalNodes.mapping || {}).length > 0 },
    { key: 'navigation', name: '导航系统', status: Object.keys(systemStatus.functionalNodes.navigation || {}).length > 0 },
    { key: 'supply', name: '补给系统', status: Object.keys(systemStatus.functionalNodes.supply || {}).length > 0 },
    { key: 'camera', name: '相机', status: Object.keys(systemStatus.functionalNodes.sensors.camera || {}).length > 0 },
    { key: 'lidar', name: '激光雷达', status: Object.keys(systemStatus.functionalNodes.sensors.lidar || {}).length > 0 },
    { key: 'webVideo', name: 'Web视频', status: Object.keys(systemStatus.functionalNodes.sensors.webVideo || {}).length > 0 },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>系统监控</h2>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={fetchSystemStatus}
          loading={loading}
        >
          刷新状态
        </Button>
      </div>

      {/* 系统状态概览 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                <Tag color={getModeColor(systemStatus.mode)} style={{ fontSize: '16px', padding: '4px 12px' }}>
                  {getModeName(systemStatus.mode)}
                </Tag>
              </div>
              <div style={{ color: '#666' }}>当前模式</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                {systemStatus.uptime}
              </div>
              <div style={{ color: '#666' }}>运行时间</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                {basicServicesData.filter(s => s.status).length}/{basicServicesData.length}
              </div>
              <div style={{ color: '#666' }}>基础服务</div>
            </div>
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                {functionalNodesData.filter(n => n.status).length}/{functionalNodesData.length}
              </div>
              <div style={{ color: '#666' }}>功能节点</div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 模式切换控制 */}
      <Card title="模式控制" style={{ marginBottom: '24px' }}>
        <Alert
          title="模式切换说明"
          description="切换模式会自动停止当前模式的节点并启动新模式的节点，请确保当前没有正在执行的任务。"
          type="info"
          showIcon
          style={{ marginBottom: '16px' }}
        />
        <Space size="large">
          <Button 
            type={systemStatus.mode === 'idle' ? 'primary' : 'default'}
            icon={<PoweroffOutlined />}
            onClick={() => handleSwitchMode('idle')}
            loading={loading}
          >
            待机模式
          </Button>
          <Button 
            type={systemStatus.mode === 'mapping' ? 'primary' : 'default'}
            icon={<SettingOutlined />}
            onClick={() => handleSwitchMode('mapping')}
            loading={loading}
          >
            建图模式
          </Button>
          <Button 
            type={systemStatus.mode === 'navigation' ? 'primary' : 'default'}
            icon={<PlayCircleOutlined />}
            onClick={() => handleSwitchMode('navigation')}
            loading={loading}
          >
            导航模式
          </Button>
          <Button 
            type={systemStatus.mode === 'supply' ? 'primary' : 'default'}
            icon={<SettingOutlined />}
            onClick={() => handleSwitchMode('supply')}
            loading={loading}
          >
            补给模式
          </Button>
        </Space>
      </Card>

      {/* 详细状态标签页 */}
      <Card>
        <Tabs 
          activeKey={activeTab} 
          onChange={setActiveTab}
          items={[
            {
              key: 'basic',
              label: '基础服务',
              children: (
                <Table
                  columns={basicServicesColumns}
                  dataSource={basicServicesData}
                  pagination={false}
                  size="small"
                />
              )
            },
            {
              key: 'functional',
              label: '功能节点',
              children: (
                <Table
                  columns={functionalNodesColumns}
                  dataSource={functionalNodesData}
                  pagination={false}
                  size="small"
                />
              )
            },
            {
              key: 'info',
              label: '系统信息',
              children: (
                <div style={{ padding: '16px' }}>
                  <p><strong>主机名:</strong> {systemStatus.hostname || 'N/A'}</p>
                  <p><strong>上次模式切换:</strong> {systemStatus.lastModeChange || 'N/A'}</p>
                  <p><strong>系统监控:</strong> 
                    <Tag color={systemStatus.basicServices.systemMonitor ? 'success' : 'error'}>
                      {systemStatus.basicServices.systemMonitor ? '正常' : '异常'}
                    </Tag>
                  </p>
                </div>
              )
            }
          ]}
        />
      </Card>
    </div>
  );
};

export default SystemMonitor;