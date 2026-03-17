import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Space, Tag, message, Switch } from 'antd';
import { EnvironmentOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { socketService } from '../services/socket';
import { supplyManagementApi } from '../services/api';

const SupplyManagement: React.FC = () => {
  const [supplyStatus, setSupplyStatus] = useState({
    status: 'idle',
    chargingEnabled: true,
    wateringEnabled: true,
    autoSupplyEnabled: false,
    waterLevel: 100,
    batteryLevel: 100,
    waterThreshold: 20,
    batteryThreshold: 20,
  });
  const [relayStatus, setRelayStatus] = useState<any>(null);
  const [chargingStatus, setChargingStatus] = useState<any>(null);
  const [networkConfig, setNetworkConfig] = useState({
    relay_ip: '192.168.4.1',
    relay_port: 80,
    charging_ip: '192.168.1.100',
    charging_port: 502
  });

  const loadNetworkConfig = async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      
      let relay_ip = '192.168.4.1';
      let relay_port = 80;
      let charging_ip = '192.168.1.100';
      let charging_port = 502;

      for (const category in data) {
        if (Array.isArray(data[category])) {
          const foundRelayIp = data[category].find((item: any) => item.key === 'relay_ip');
          const foundRelayPort = data[category].find((item: any) => item.key === 'relay_port');
          const foundChargingIp = data[category].find((item: any) => item.key === 'charging_ip');
          const foundChargingPort = data[category].find((item: any) => item.key === 'charging_port');
          
          if (foundRelayIp) relay_ip = foundRelayIp.value;
          if (foundRelayPort) relay_port = parseInt(foundRelayPort.value);
          if (foundChargingIp) charging_ip = foundChargingIp.value;
          if (foundChargingPort) charging_port = parseInt(foundChargingPort.value);
        }
      }

      setNetworkConfig({ relay_ip, relay_port, charging_ip, charging_port });
    } catch (error) {
      console.error('加载网络配置失败:', error);
    }
  };

  const loadRelayStatus = async () => {
    try {
      const data = await supplyManagementApi.getRelayStatus(networkConfig.relay_ip);
      setRelayStatus(data);
    } catch (error: any) {
      console.error('加载补水站状态失败:', error);
      setRelayStatus({
        status: 'error',
        relay: false,
        mode: 0,
        ip: networkConfig.relay_ip,
        apIp: '',
        connected: false,
        error: error.message || '设备未连接',
        lastUpdate: new Date().toISOString()
      });
    }
  };

  const loadChargingStatus = async () => {
    try {
      const data = await supplyManagementApi.getChargingStatus(networkConfig.charging_ip);
      setChargingStatus(data);
    } catch (error: any) {
      console.error('加载充电桩状态失败:', error);
      setChargingStatus({
        chargingStatus: 0,
        brushStatus: 0,
        chargingMode: 0,
        batteryVoltage: 0,
        chargingCurrent: 0,
        endCurrent: 0,
        heartbeat: 0,
        lastUpdate: new Date().toISOString(),
        connected: false,
        error: error.message || '设备未连接',
        ipAddress: networkConfig.charging_ip,
        port: networkConfig.charging_port
      });
    }
  };

  useEffect(() => {
    socketService.connect();
    
    const initializeData = async () => {
      await loadNetworkConfig();
    };
    
    initializeData();

    // 合并定时器：根据设备状态动态调整轮询间隔
    // 在线设备每30秒轮询，离线设备每60秒轮询
    const statusCheckInterval = setInterval(() => {
      const relayOnline = relayStatus?.connected;
      const chargingOnline = chargingStatus?.connected;
      
      // 只在需要时才发起请求
      if (relayOnline || chargingOnline) {
        if (relayOnline) loadRelayStatus();
        if (chargingOnline) loadChargingStatus();
      } else {
        // 离线状态也尝试重连
        loadRelayStatus();
        loadChargingStatus();
      }
    }, 30000); // 统一使用30秒间隔

    socketService.on('ros_message', (data) => {
      if (data.topic === '/supply_status') {
        const status = JSON.parse(data.msg.data);
        setSupplyStatus(prev => {
          if (prev.autoSupplyEnabled && prev.status === 'idle') {
            const needSupply = status.waterLevel < prev.waterThreshold ||
                             status.batteryLevel < prev.batteryThreshold;
            if (needSupply) {
              console.log('自动触发补给流程');
              handleStartSupply();
            }
          }
          return { ...prev, ...status };
        });
      }
    });

    return () => {
      socketService.off('ros_message');
      clearInterval(statusCheckInterval);
    };
  }, [relayStatus?.connected, chargingStatus?.connected]);

  useEffect(() => {
    const hasValidConfig = networkConfig.relay_ip !== '192.168.4.1' && networkConfig.charging_ip !== '192.168.1.100';
    if (hasValidConfig && (!relayStatus || relayStatus.ip !== networkConfig.relay_ip || chargingStatus?.ipAddress !== networkConfig.charging_ip)) {
      loadRelayStatus();
      loadChargingStatus();
    }
  }, [networkConfig.relay_ip, networkConfig.charging_ip, relayStatus?.ip, chargingStatus?.ipAddress]);

  const sendSupplyCommand = (action: string) => {
    socketService.sendRosCommand({
      op: 'publish',
      topic: '/supply_command',
      msg: { data: JSON.stringify({ action }) },
      type: 'std_msgs/String',
    });
  };

  const handleStartSupply = async () => {
    try {
      await supplyManagementApi.startSupply();
      message.success('开始补给');
    } catch (error: any) {
      message.error('开始补给失败');
    }
  };

  const handleStopSupply = async () => {
    try {
      await supplyManagementApi.stopSupply();
      message.success('停止补给');
    } catch (error: any) {
      message.error('停止补给失败');
    }
  };

  const handlePauseSupply = async () => {
    try {
      await supplyManagementApi.pauseSupply();
      message.success('暂停补给');
    } catch (error: any) {
      message.error('暂停补给失败');
    }
  };

  const handleResumeSupply = async () => {
    try {
      await supplyManagementApi.resumeSupply();
      message.success('恢复补给');
    } catch (error: any) {
      message.error('恢复补给失败');
    }
  };

  const handleNavigateToStation = () => {
    sendSupplyCommand('navigate_to_station');
    message.info('导航到补给站');
  };

  const handleStartCharging = async () => {
    try {
      await supplyManagementApi.startCharging(networkConfig.charging_ip);
      message.success('开始充电');
      loadChargingStatus();
    } catch (error: any) {
      message.error('开始充电失败');
    }
  };

  const handleStopCharging = async () => {
    try {
      await supplyManagementApi.stopCharging(networkConfig.charging_ip);
      message.success('停止充电');
      loadChargingStatus();
    } catch (error: any) {
      message.error('停止充电失败');
    }
  };

  const handleStartWatering = async () => {
    try {
      await supplyManagementApi.startWateringRelay(networkConfig.relay_ip);
      message.success('开始注水');
      loadRelayStatus();
    } catch (error: any) {
      message.error('开始注水失败');
    }
  };

  const handleStopWatering = async () => {
    try {
      await supplyManagementApi.stopWateringRelay(networkConfig.relay_ip);
      message.success('停止注水');
      loadRelayStatus();
    } catch (error: any) {
      message.error('停止注水失败');
    }
  };

  const handleManualSupply = () => {
    if (supplyStatus.status === 'idle') {
      sendSupplyCommand('start_supply');
      message.success('手动触发补给流程');
    } else {
      message.warning('补给正在进行中，请稍后再试');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: any = {
      idle: { color: 'default', text: '空闲' },
      navigating: { color: 'processing', text: '导航中' },
      aligning: { color: 'processing', text: '对齐中' },
      watering: { color: 'blue', text: '注水中' },
      charging: { color: 'orange', text: '充电中' },
      completed: { color: 'success', text: '完成' },
      failed: { color: 'error', text: '失败' },
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <Row gutter={[24, 24]}>
        <Col xs={24}>
          <Card 
            title="🎛️ 补给控制中心" 
            style={{ 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              background: 'white'
            }}
          >
            <Row gutter={[24, 16]}>
              <Col xs={24} lg={8}>
                <Card size="small" title="🚀 主要操作" style={{ background: '#fafafa' }}>
                  <Space vertical style={{ width: '100%' }}>
                    {supplyStatus.autoSupplyEnabled ? (
                      <Button
                        type="primary"
                        size="large"
                        block
                        onClick={handleStopSupply}
                        disabled={supplyStatus.status === 'idle'}
                        style={{ height: '48px', fontSize: '16px' }}
                      >
                        停止自动补给
                      </Button>
                    ) : (
                      <Button
                        type="primary"
                        size="large"
                        block
                        onClick={handleManualSupply}
                        disabled={supplyStatus.status !== 'idle'}
                        style={{ height: '48px', fontSize: '16px' }}
                      >
                        手动触发补给
                      </Button>
                    )}
                    <Button
                      danger
                      size="large"
                      block
                      onClick={handleStopSupply}
                      disabled={supplyStatus.status === 'idle'}
                      style={{ height: '48px', fontSize: '16px' }}
                    >
                      紧急停止
                    </Button>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card size="small" title="🧭 导航操作" style={{ background: '#fafafa' }}>
                  <Button
                    icon={<EnvironmentOutlined />}
                    size="large"
                    block
                    onClick={handleNavigateToStation}
                    disabled={supplyStatus.status !== 'idle'}
                    style={{ height: '48px', fontSize: '16px' }}
                  >
                    导航到补给站
                  </Button>
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card size="small" title="⚙️ 补给模式" style={{ background: '#fafafa' }}>
                  <Space vertical style={{ width: '100%' }}>
                    <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                      <Switch
                        checkedChildren="全自动"
                        unCheckedChildren="手动"
                        checked={supplyStatus.autoSupplyEnabled}
                        onChange={(checked) => {
                          setSupplyStatus(prev => ({ ...prev, autoSupplyEnabled: checked }));
                          message.success(checked ? '已开启全自动补给' : '已切换到手动模式');
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>
                      {supplyStatus.autoSupplyEnabled 
                        ? '根据水位电量自动触发补给' 
                        : '手动控制补给功能'}
                    </div>
                  </Space>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24}>
          <Card 
            title="🔧 功能控制" 
            style={{ 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              background: 'white'
            }}
          >
            <Row gutter={[24, 16]}>
              <Col xs={24} lg={12}>
                <Card size="small" title="⚡ 充电控制" style={{ background: '#f0f8ff' }}>
                  {chargingStatus ? (
                    <div style={{ marginBottom: '16px', padding: '12px', background: chargingStatus.connected ? '#fff' : '#fff2f0', borderRadius: '8px', border: chargingStatus.connected ? '1px solid #d9d9d9' : '1px solid #ffccc7' }}>
                      <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>设备状态</span>
                        {chargingStatus.connected ? (
                          <Tag color="green" icon={<CheckOutlined />}>在线</Tag>
                        ) : (
                          <Tag color="red" icon={<CloseOutlined />}>离线</Tag>
                        )}
                      </div>
                      {chargingStatus.connected ? (
                        <Row gutter={[16, 8]}>
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>充电状态</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {chargingStatus.chargingStatus === 0 ? '未在充电' : 
                               chargingStatus.chargingStatus === 1 ? '正在充电' : 
                               chargingStatus.chargingStatus === 2 ? '充电完成' : '未知'}
                            </div>
                          </Col>
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>充电刷状态</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {chargingStatus.brushStatus === 0 ? '已缩回' : 
                               chargingStatus.brushStatus === 1 ? '正在伸出' : 
                               chargingStatus.brushStatus === 2 ? '正在缩回' : 
                               chargingStatus.brushStatus === 3 ? '已伸出' : '未知'}
                            </div>
                          </Col>
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>电池电压</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {(chargingStatus.batteryVoltage / 10).toFixed(1)}V
                            </div>
                          </Col>
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>充电电流</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {chargingStatus.chargingCurrent}mA
                            </div>
                          </Col>
                        </Row>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#ff4d4f', padding: '8px 0' }}>
                          <div style={{ fontSize: '16px', marginBottom: '8px' }}>⚠️</div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>设备未连接</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            IP: {chargingStatus.ipAddress}:{chargingStatus.port}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginBottom: '16px', padding: '12px', background: '#f5f5f5', borderRadius: '8px', textAlign: 'center', color: '#999' }}>
                      加载中...
                    </div>
                  )}
                  <Row gutter={[8, 8]}>
                    <Col xs={12}>
                      <Button
                        type="primary"
                        block
                        onClick={handleStartCharging}
                        disabled={!supplyStatus.chargingEnabled || !chargingStatus?.connected || chargingStatus?.chargingStatus === 1}
                        style={{ height: '40px' }}
                      >
                        开始充电
                      </Button>
                    </Col>
                    <Col xs={12}>
                      <Button
                        block
                        onClick={handleStopCharging}
                        disabled={!chargingStatus?.connected || chargingStatus?.chargingStatus === 0}
                        style={{ height: '40px' }}
                      >
                        停止充电
                      </Button>
                    </Col>
                  </Row>
                </Card>
              </Col>
              <Col xs={24} lg={12}>
                <Card size="small" title="💧 注水控制" style={{ background: '#f0f8ff' }}>
                  {relayStatus ? (
                    <div style={{ marginBottom: '16px', padding: '12px', background: relayStatus.connected ? '#fff' : '#fff2f0', borderRadius: '8px', border: relayStatus.connected ? '1px solid #d9d9d9' : '1px solid #ffccc7' }}>
                      <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>设备状态</span>
                        {relayStatus.connected ? (
                          <Tag color="green" icon={<CheckOutlined />}>在线</Tag>
                        ) : (
                          <Tag color="red" icon={<CloseOutlined />}>离线</Tag>
                        )}
                      </div>
                      {relayStatus.connected ? (
                        <Row gutter={[16, 8]}>
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>继电器状态</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {relayStatus.relay ? (
                                <Tag color="green">已开启</Tag>
                              ) : (
                                <Tag color="default">已关闭</Tag>
                              )}
                            </div>
                          </Col>
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>工作模式</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {relayStatus.mode === 0 ? 'AP模式' : 
                               relayStatus.mode === 1 ? '客户端模式' : 
                               relayStatus.mode === 2 ? 'AP+客户端' : '未知'}
                            </div>
                          </Col>
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>设备IP</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {relayStatus.ip || 'N/A'}
                            </div>
                          </Col>
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>AP IP</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {relayStatus.apIp || 'N/A'}
                            </div>
                          </Col>
                        </Row>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#ff4d4f', padding: '8px 0' }}>
                          <div style={{ fontSize: '16px', marginBottom: '8px' }}>⚠️</div>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>设备未连接</div>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            IP: {relayStatus.ip}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginBottom: '16px', padding: '12px', background: '#f5f5f5', borderRadius: '8px', textAlign: 'center', color: '#999' }}>
                      加载中...
                    </div>
                  )}
                  <Row gutter={[8, 8]}>
                    <Col xs={12}>
                      <Button
                        type="primary"
                        block
                        onClick={handleStartWatering}
                        disabled={!supplyStatus.wateringEnabled || !relayStatus?.connected || relayStatus?.relay}
                        style={{ height: '40px' }}
                      >
                        开始注水
                      </Button>
                    </Col>
                    <Col xs={12}>
                      <Button
                        block
                        onClick={handleStopWatering}
                        disabled={!relayStatus?.connected || !relayStatus?.relay}
                        style={{ height: '40px' }}
                      >
                        停止注水
                      </Button>
                    </Col>
                  </Row>
                </Card>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SupplyManagement;