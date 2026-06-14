import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Button, Space, Tag, message, Switch } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { socketService } from '../services/socket';
import { supplyManagementApi } from '../services/api';

const SupplyManagement: React.FC = () => {
  const [supplyStatus, setSupplyStatus] = useState({
    status: 'idle',
    chargingEnabled: true,
    wateringEnabled: true,
    autoSupplyEnabled: true,
    waterLevel: 100,
    batteryLevel: 100,
    waterThreshold: 20,
    batteryThreshold: 20,
  });
  const [operatingMode, setOperatingMode] = useState<'idle' | 'spray' | 'supply'>('idle');
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

  const handleStartSupply = async () => {
    try {
      await supplyManagementApi.startSupply();
      message.success('开始补给');
    } catch {
      message.error('开始补给失败');
    }
  };

  const handleStopSupply = async () => {
    try {
      await supplyManagementApi.stopSupply();
      message.success('停止补给');
    } catch {
      message.error('停止补给失败');
    }
  };

  const startSupplyWithMode = async () => {
    await handleStartSupply();
    setOperatingMode('supply');
  };

  const handleManualSupply = async () => {
    await startSupplyWithMode();
  };

  const handleCycleMode = async () => {
    if (operatingMode === 'idle') {
      try {
        await supplyManagementApi.switchToSpray();
        setOperatingMode('spray');
        message.success('已切换到喷水模式');
      } catch {
        message.error('切换喷水模式失败');
      }
    } else if (operatingMode === 'spray') {
      if (supplyStatus.autoSupplyEnabled) {
        message.info('自动模式下补给由系统自动触发，无法手动切换');
        return;
      }
      await startSupplyWithMode();
    } else {
      await handleStopSupply();
      setOperatingMode('idle');
    }
  };

  useEffect(() => {
    socketService.connect();

    const initializeData = async () => {
      await loadNetworkConfig();
    };

    initializeData();

    const statusCheckInterval = setInterval(() => {
      const relayOnline = relayStatus?.connected;
      const chargingOnline = chargingStatus?.connected;

      if (relayOnline || chargingOnline) {
        if (relayOnline) loadRelayStatus();
        if (chargingOnline) loadChargingStatus();
      } else {
        loadRelayStatus();
        loadChargingStatus();
      }
    }, 30000);

    socketService.on('ros_message', (data: any) => {
      if (data.topic === '/supply_status') {
        const status = JSON.parse(data.msg.data);
        setSupplyStatus(prev => ({ ...prev, ...status }));
      }
      if (data.topic === '/unified_state_machine/status') {
        try {
          const stateData = JSON.parse(data.msg.data);
          const currentState = stateData.current_state || '';
          if (currentState === 'spray_navigation') {
            setOperatingMode('spray');
          } else if (currentState === 'resupply_navigation' ||
                     currentState === 'visual_servo_approach' ||
                     currentState === 'precision_coast' ||
                     currentState === 'visual_servo_locked' ||
                     currentState === 'resupply_backing_out') {
            setOperatingMode('supply');
          } else {
            setOperatingMode('idle');
          }
        } catch {
          // ignore parse errors
        }
      }
    });

    socketService.on('automation_status', (data: any) => {
      if (data.auto_supply_enabled !== undefined) {
        setSupplyStatus(prev => ({ ...prev, autoSupplyEnabled: data.auto_supply_enabled }));
      }
    });

    return () => {
      socketService.off('ros_message');
      socketService.off('automation_status');
      clearInterval(statusCheckInterval);
    };
  }, [relayStatus?.connected, chargingStatus?.connected]);

  useEffect(() => {
    if (supplyStatus.autoSupplyEnabled && operatingMode === 'spray' && supplyStatus.status === 'idle') {
      const needSupply = supplyStatus.waterLevel < supplyStatus.waterThreshold ||
                       supplyStatus.batteryLevel < supplyStatus.batteryThreshold;
      if (needSupply) {
        console.log('自动触发补给流程');
        setOperatingMode('supply');
        handleStartSupply();
      }
    }
  }, [supplyStatus.waterLevel, supplyStatus.batteryLevel]);

  useEffect(() => {
    if (operatingMode === 'supply' && supplyStatus.status === 'idle') {
      if (supplyStatus.autoSupplyEnabled) {
        setOperatingMode('spray');
      } else {
        setOperatingMode('idle');
      }
    }
  }, [supplyStatus.status]);

  useEffect(() => {
    const hasValidConfig = networkConfig.relay_ip !== '192.168.4.1' && networkConfig.charging_ip !== '192.168.1.100';
    if (hasValidConfig && (!relayStatus || relayStatus.ip !== networkConfig.relay_ip || chargingStatus?.ipAddress !== networkConfig.charging_ip)) {
      loadRelayStatus();
      loadChargingStatus();
    }
  }, [networkConfig.relay_ip, networkConfig.charging_ip, relayStatus?.ip, chargingStatus?.ipAddress]);

  const handleStartCharging = async () => {
    try {
      await supplyManagementApi.startCharging(networkConfig.charging_ip);
      message.success('开始充电');
      loadChargingStatus();
    } catch {
      message.error('开始充电失败');
    }
  };

  const handleStopCharging = async () => {
    try {
      await supplyManagementApi.stopCharging(networkConfig.charging_ip);
      message.success('停止充电');
      loadChargingStatus();
    } catch {
      message.error('停止充电失败');
    }
  };

  const handleStartWatering = async () => {
    try {
      await supplyManagementApi.startWateringRelay(networkConfig.relay_ip);
      message.success('开始注水');
      loadRelayStatus();
    } catch {
      message.error('开始注水失败');
    }
  };

  const handleStopWatering = async () => {
    try {
      await supplyManagementApi.stopWateringRelay(networkConfig.relay_ip);
      message.success('停止注水');
      loadRelayStatus();
    } catch {
      message.error('停止注水失败');
    }
  };

  const modeLabels: Record<string, { label: string; color: string }> = {
    idle: { label: '初始状态', color: 'default' },
    spray: { label: '喷水作业', color: 'processing' },
    supply: { label: '补给状态', color: 'orange' },
  };

  const nextModeText = () => {
    if (operatingMode === 'idle') return '切换为喷水模式';
    if (operatingMode === 'spray') return '切换为补给模式';
    return '切换为初始状态';
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
                    <Button
                      type="primary"
                      size="large"
                      block
                      onClick={handleManualSupply}
                      disabled={
                        supplyStatus.autoSupplyEnabled ||
                        operatingMode === 'supply'
                      }
                      style={{ height: '48px', fontSize: '16px' }}
                    >
                      手动触发补给
                    </Button>
                  </Space>
                </Card>
              </Col>
              <Col xs={24} lg={8}>
                <Card size="small" title="🔄 模式切换" style={{ background: '#fafafa' }}>
                  <Space vertical style={{ width: '100%' }}>
                    <Button
                      size="large"
                      block
                      onClick={handleCycleMode}
                      style={{ height: '48px', fontSize: '16px' }}
                    >
                      {nextModeText()}
                    </Button>
                    <div style={{ fontSize: '13px', textAlign: 'center', padding: '4px 0' }}>
                      当前状态: <Tag color={modeLabels[operatingMode].color}>{modeLabels[operatingMode].label}</Tag>
                    </div>
                  </Space>
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
                        onChange={async (checked) => {
                          setSupplyStatus(prev => ({ ...prev, autoSupplyEnabled: checked }));
                          try {
                            await supplyManagementApi.setAutoSupplyEnabled(checked);
                          } catch {
                            console.error('同步自动补给状态失败');
                          }
                          message.success(checked ? '已开启全自动补给' : '已切换到手动模式');
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', textAlign: 'center' }}>
                      {supplyStatus.autoSupplyEnabled 
                        ? '喷水模式下自动触发补给' 
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