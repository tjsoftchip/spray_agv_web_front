import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Button, Space, Statistic, Tag, message, Modal, Form, Input, InputNumber, Select, Table, Popconfirm, Switch } from 'antd';
import { EnvironmentOutlined, PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { socketService } from '../services/socket';
import { supplyStationApi, supplyManagementApi } from '../services/api';

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
  const [stations, setStations] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStation, setEditingStation] = useState<any>(null);
  const [availablePoints, setAvailablePoints] = useState<any[]>([]);
  const [gpuMetrics, setGpuMetrics] = useState<any>(null);
  const [systemMetrics, setSystemMetrics] = useState<any>(null);
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [form] = Form.useForm();
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
      
      console.log('Settings API response:', data);
      
      // Settings API returns grouped configs by category
      // Search across all categories to find network config
      let relay_ip = '192.168.4.1';
      let relay_port = 80;
      let charging_ip = '192.168.1.100';
      let charging_port = 502;

      // Search in all categories
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

      const config = {
        relay_ip,
        relay_port,
        charging_ip,
        charging_port
      };
      
      console.log('Loaded network config:', config);
      setNetworkConfig(config);
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
      // 设置为离线状态
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
      // 设置为离线状态
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
    
    // 先加载网络配置，然后加载其他数据
    const initializeData = async () => {
      await loadNetworkConfig();
      loadStations();
      loadAvailablePoints();
      loadGPUMetrics();
      loadSystemMetrics();
      loadTaskStatus();
    };
    
    initializeData();

    // 定期刷新数据 - 降低频率以减少错误日志
    const interval = setInterval(() => {
      loadGPUMetrics();
      loadSystemMetrics();
      loadTaskStatus();
      // 只在设备在线时才频繁查询状态，否则降低频率
      if (relayStatus?.connected) {
        loadRelayStatus();
      }
      if (chargingStatus?.connected) {
        loadChargingStatus();
      }
    }, 15000);

    // 离线设备的低频轮询
    const offlineInterval = setInterval(() => {
      if (!relayStatus?.connected) {
        loadRelayStatus();
      }
      if (!chargingStatus?.connected) {
        loadChargingStatus();
      }
    }, 30000);

    socketService.on('ros_message', (data) => {
      if (data.topic === '/supply_status') {
        const status = JSON.parse(data.msg.data);
        setSupplyStatus(prev => {
          // 自动补给逻辑
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
      clearInterval(interval);
      clearInterval(offlineInterval);
    };
  }, [relayStatus?.connected, chargingStatus?.connected]);

  // 当网络配置更新后，加载设备状态
  useEffect(() => {
    // 只在网络配置从默认值更新到实际值时才加载
    const hasValidConfig = networkConfig.relay_ip !== '192.168.4.1' && networkConfig.charging_ip !== '192.168.1.100';
    
    if (hasValidConfig && (!relayStatus || relayStatus.ip !== networkConfig.relay_ip || chargingStatus?.ipAddress !== networkConfig.charging_ip)) {
      console.log('Network config updated, loading device status...');
      loadRelayStatus();
      loadChargingStatus();
    }
  }, [networkConfig.relay_ip, networkConfig.charging_ip, relayStatus?.ip, chargingStatus?.ipAddress]);

  const loadStations = async () => {
    try {
      const data = await supplyStationApi.getStations();
      setStations(data);
    } catch (error: any) {
      message.error('加载补给站列表失败');
    }
  };

  const loadAvailablePoints = async () => {
    try {
      // 模拟从模板或地图获取可用点
      const mockPoints = [
        { id: 'point1', name: '预设点1', x: 0, y: 0 },
        { id: 'point2', name: '预设点2', x: 5, y: 0 },
        { id: 'point3', name: '预设点3', x: 0, y: 5 },
        { id: 'point4', name: '预设点4', x: 5, y: 5 },
      ];
      setAvailablePoints(mockPoints);
    } catch (error: any) {
      message.error('加载可用点位失败');
    }
  };

  const loadGPUMetrics = async () => {
    try {
      const data = await supplyManagementApi.getGPUMetrics();
      setGpuMetrics(data);
    } catch (error: any) {
      console.error('加载GPU指标失败:', error);
    }
  };

  const loadSystemMetrics = async () => {
    try {
      const data = await supplyManagementApi.getSystemMetrics();
      setSystemMetrics(data);
    } catch (error: any) {
      console.error('加载系统指标失败:', error);
    }
  };

  const loadTaskStatus = async () => {
    try {
      const data = await supplyManagementApi.getSupplyStatus();
      setTaskStatus(data);
    } catch (error: any) {
      console.error('加载任务状态失败:', error);
    }
  };

  const handleGetCurrentPosition = async () => {
    try {
      // 模拟从ROS获取当前位置
      const currentPosition = {
        x: 2.5,
        y: 2.5,
        z: 0,
        orientation: { x: 0, y: 0, z: 0, w: 1 }
      };

      form.setFieldsValue({
        x: currentPosition.x,
        y: currentPosition.y,
        z: currentPosition.z,
        orientation: currentPosition.orientation
      });
      
      message.success('已获取当前位置');
    } catch (error: any) {
      message.error('获取当前位置失败');
    }
  };

  const handleSelectPoint = (pointId: string) => {
    const point = availablePoints.find(p => p.id === pointId);
    if (point) {
      form.setFieldsValue({
        position: { x: point.x, y: point.y, z: 0 }
      });
      message.success(`已选择点位: ${point.name}`);
    }
  };

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
      loadTaskStatus();
    } catch (error: any) {
      message.error('开始补给失败');
    }
  };

  const handleStopSupply = async () => {
    try {
      await supplyManagementApi.stopSupply();
      message.success('停止补给');
      loadTaskStatus();
    } catch (error: any) {
      message.error('停止补给失败');
    }
  };

  const handlePauseSupply = async () => {
    try {
      await supplyManagementApi.pauseSupply();
      message.success('暂停补给');
      loadTaskStatus();
    } catch (error: any) {
      message.error('暂停补给失败');
    }
  };

  const handleResumeSupply = async () => {
    try {
      await supplyManagementApi.resumeSupply();
      message.success('恢复补给');
      loadTaskStatus();
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

  // 任务管理函数
  const handleCreateTask = async () => {
    try {
      await supplyManagementApi.createTask();
      message.success('创建任务成功');
      loadTaskStatus();
    } catch (error: any) {
      message.error('创建任务失败');
    }
  };

  const handleStartTask = async () => {
    try {
      await supplyManagementApi.startTask();
      message.success('启动任务成功');
      loadTaskStatus();
    } catch (error: any) {
      message.error('启动任务失败');
    }
  };

  const handlePauseTask = async () => {
    try {
      await supplyManagementApi.pauseTask();
      message.success('暂停任务成功');
      loadTaskStatus();
    } catch (error: any) {
      message.error('暂停任务失败');
    }
  };

  const handleResumeTask = async () => {
    try {
      await supplyManagementApi.resumeTask();
      message.success('恢复任务成功');
      loadTaskStatus();
    } catch (error: any) {
      message.error('恢复任务失败');
    }
  };

  const handleSaveTask = async () => {
    try {
      await supplyManagementApi.saveTask();
      message.success('保存任务成功');
    } catch (error: any) {
      message.error('保存任务失败');
    }
  };

  const handleLoadTask = async () => {
    try {
      await supplyManagementApi.loadTask();
      message.success('加载任务成功');
      loadTaskStatus();
    } catch (error: any) {
      message.error('加载任务失败');
    }
  };

  const handleStopTask = async () => {
    try {
      await supplyManagementApi.stopTask();
      message.success('停止任务成功');
      loadTaskStatus();
    } catch (error: any) {
      message.error('停止任务失败');
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

  

  const handleCreateStation = () => {
    setEditingStation(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'combined',
      waterSupplyEnabled: true,
      chargingEnabled: true,
      status: 'online',
    });
    setModalVisible(true);
  };

  const handleEditStation = (record: any) => {
    setEditingStation(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDeleteStation = async (id: string) => {
    try {
      await supplyStationApi.deleteStation(id);
      message.success('删除成功');
      loadStations();
    } catch (error: any) {
      message.error('删除失败');
    }
  };

  const handleSubmitStation = async () => {
    try {
      const values = await form.validateFields();
      if (editingStation) {
        await supplyStationApi.updateStation(editingStation.id, values);
        message.success('更新成功');
      } else {
        await supplyStationApi.createStation(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      loadStations();
    } catch (error: any) {
      message.error('操作失败');
    }
  };

  const stationColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const typeMap: any = {
          water: '注水',
          charge: '充电',
          combined: '综合',
        };
        return typeMap[type] || type;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap: any = {
          online: { color: 'green', text: '在线' },
          offline: { color: 'red', text: '离线' },
          maintenance: { color: 'orange', text: '维护中' },
        };
        const config = statusMap[status] || { color: 'default', text: status };
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditStation(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除此补给站吗？"
            onConfirm={() => handleDeleteStation(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px', background: '#f5f5f5', minHeight: '100vh' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>补给管理</h1>
        <p style={{ margin: '8px 0 0 0', color: '#666' }}>智能补给站管理与控制系统</p>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={8}>
          <Card 
            style={{ 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white'
            }}
          >
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚡</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>补给状态</div>
              <div style={{ fontSize: '24px', marginBottom: '16px' }}>{getStatusTag(supplyStatus.status)}</div>
              
              <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
                <Col xs={12}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                      💧 {supplyStatus.waterLevel}%
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.8 }}>水位</div>
                  </div>
                </Col>
                <Col xs={12}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
                      🔋 {supplyStatus.batteryLevel}%
                    </div>
                    <div style={{ fontSize: '12px', opacity: 0.8 }}>电量</div>
                  </div>
                </Col>
              </Row>
              
              <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>充电功能</div>
                  <Tag color={supplyStatus.chargingEnabled ? 'success' : 'default'}>
                    {supplyStatus.chargingEnabled ? '已启用' : '未启用'}
                  </Tag>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', opacity: 0.8 }}>注水功能</div>
                  <Tag color={supplyStatus.wateringEnabled ? 'success' : 'default'}>
                    {supplyStatus.wateringEnabled ? '已启用' : '未启用'}
                  </Tag>
                </div>
              </div>
            </div>
          </Card>
        </Col>

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
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>充电模式</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {chargingStatus.chargingMode === 0 ? '手动' : '自动'}
                            </div>
                          </Col>
                          <Col xs={12}>
                            <div style={{ fontSize: '12px', color: '#666' }}>心跳</div>
                            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                              {chargingStatus.heartbeat}
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
                          {chargingStatus.error && (
                            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                              {chargingStatus.error}
                            </div>
                          )}
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
                          {relayStatus.error && (
                            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                              {relayStatus.error}
                            </div>
                          )}
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

        <Col xs={24}>
          <Card 
            title="💡 使用说明" 
            style={{ 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              background: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)'
            }}
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} md={8}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>🎯</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold' }}>智能补给</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>系统自动检测并触发补给流程</div>
                </div>
              </Col>
              <Col xs={24} md={8}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>🤖</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold' }}>自动导航</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>自动导航到补给站并精确对齐</div>
                </div>
              </Col>
              <Col xs={24} md={8}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚙️</div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold' }}>灵活控制</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>支持手动控制充电和注水功能</div>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        <Col xs={24}>
          <Card 
            title="🏭 补给站管理" 
            style={{ 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              background: 'white'
            }}
            extra={
              <Button 
                type="primary" 
                icon={<PlusOutlined />} 
                onClick={handleCreateStation}
                style={{ borderRadius: '8px' }}
              >
                添加补给站
              </Button>
            }
          >
            <Table
              columns={stationColumns}
              dataSource={stations}
              rowKey="id"
              pagination={false}
              size="middle"
              style={{ width: '100%' }}
              scroll={{ x: 'max-content' }}
              rowClassName={(record, index) => 
                index % 2 === 0 ? 'table-row-light' : 'table-row-dark'
              }
            />
          </Card>
        </Col>
      </Row>

      {/* GPU监控和任务管理 */}
      <Row gutter={[24, 24]} style={{ marginTop: '24px' }}>
        <Col xs={24} lg={12}>
          <Card 
            title="🖥️ GPU监控" 
            style={{ 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          >
            {gpuMetrics ? (
              <Row gutter={[16, 16]}>
                <Col xs={12}>
                  <Statistic title="GPU利用率" value={gpuMetrics.utilization} suffix="%" />
                </Col>
                <Col xs={12}>
                  <Statistic title="显存使用" value={gpuMetrics.memoryUsed} suffix={`MB / ${gpuMetrics.memoryTotal}MB`} />
                </Col>
                <Col xs={12}>
                  <Statistic title="温度" value={gpuMetrics.temperature} suffix="°C" />
                </Col>
                <Col xs={12}>
                  <Statistic title="功耗" value={gpuMetrics.powerDraw} suffix="W" />
                </Col>
              </Row>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                GPU数据加载中...
              </div>
            )}
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card 
            title="📋 任务管理" 
            style={{ 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          >
            <Space vertical style={{ width: '100%' }}>
              <Row gutter={[8, 8]}>
                <Col xs={12}>
                  <Button block onClick={handleCreateTask}>创建任务</Button>
                </Col>
                <Col xs={12}>
                  <Button block onClick={handleStartTask}>启动任务</Button>
                </Col>
                <Col xs={12}>
                  <Button block onClick={handlePauseTask}>暂停任务</Button>
                </Col>
                <Col xs={12}>
                  <Button block onClick={handleResumeTask}>恢复任务</Button>
                </Col>
                <Col xs={12}>
                  <Button block onClick={handleSaveTask}>保存任务</Button>
                </Col>
                <Col xs={12}>
                  <Button block onClick={handleLoadTask}>加载任务</Button>
                </Col>
              </Row>
              <Button type="primary" danger block onClick={handleStopTask}>
                停止任务
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 补给控制增强 */}
      <Row gutter={[24, 24]} style={{ marginTop: '24px' }}>
        <Col xs={24}>
          <Card 
            title="🎮 补给控制" 
            style={{ 
              borderRadius: '12px', 
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          >
            <Space size="large">
              <Button type="primary" onClick={handleStartSupply}>启动补给</Button>
              <Button onClick={handlePauseSupply}>暂停补给</Button>
              <Button onClick={handleResumeSupply}>恢复补给</Button>
              <Button danger onClick={handleStopSupply}>停止补给</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      <Modal
        title={
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
            {editingStation ? '✏️ 编辑补给站' : '➕ 添加补给站'}
          </div>
        }
        open={modalVisible}
        onOk={handleSubmitStation}
        onCancel={() => setModalVisible(false)}
        width={800}
        style={{ borderRadius: '12px' }}
      >
        <Form form={form} layout="vertical">
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Form.Item
                name="name"
                label="🏷️ 补给站名称"
                rules={[{ required: true, message: '请输入名称' }]}
              >
                <Input placeholder="例如: 主补给站" style={{ borderRadius: '8px' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="type"
                label="🔧 补给站类型"
                rules={[{ required: true, message: '请选择类型' }]}
              >
                <Select style={{ borderRadius: '8px' }}>
                  <Select.Option value="water">💧 仅注水</Select.Option>
                  <Select.Option value="charge">⚡ 仅充电</Select.Option>
                  <Select.Option value="combined">🔄 综合补给</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="📝 描述信息">
            <Input.TextArea rows={2} placeholder="补给站描述信息" style={{ borderRadius: '8px' }} />
          </Form.Item>

          <Form.Item label="📍 位置设置">
            <div style={{ background: '#f5f5f5', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <Space vertical style={{ width: '100%' }}>
                <div>
                  <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>🗺️ 选择预设点位</div>
                  <Select
                    placeholder="选择预设点位"
                    style={{ width: '100%', marginBottom: '8px' }}
                    onChange={handleSelectPoint}
                    allowClear
                  >
                    {availablePoints.map(point => (
                      <Select.Option key={point.id} value={point.id}>
                        {point.name} ({point.x}, {point.y})
                      </Select.Option>
                    ))}
                  </Select>
                </div>
                
                <div>
                  <div style={{ marginBottom: '8px', fontSize: '14px', fontWeight: 'bold' }}>🎯 获取当前位置</div>
                  <Button 
                    type="dashed" 
                    onClick={handleGetCurrentPosition}
                    style={{ width: '100%', marginBottom: '8px' }}
                  >
                    📍 使用当前位置
                  </Button>
                </div>
              </Space>
            </div>
            
            <Row gutter={[8, 8]}>
              <Col xs={8}>
                <Form.Item name={['position', 'x']} label="X坐标" rules={[{ required: true, message: '请输入X坐标' }]}>
                  <InputNumber placeholder="0.0" step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8}>
                <Form.Item name={['position', 'y']} label="Y坐标" rules={[{ required: true, message: '请输入Y坐标' }]}>
                  <InputNumber placeholder="0.0" step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={8}>
                <Form.Item name={['position', 'z']} label="Z坐标" rules={[{ required: true, message: '请输入Z坐标' }]}>
                  <InputNumber placeholder="0.0" step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          <Form.Item label="🧭 朝向设置">
            <Row gutter={[8, 8]}>
              <Col xs={6}>
                <Form.Item name={['orientation', 'x']} label="X">
                  <InputNumber placeholder="0.0" step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={6}>
                <Form.Item name={['orientation', 'y']} label="Y">
                  <InputNumber placeholder="0.0" step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={6}>
                <Form.Item name={['orientation', 'z']} label="Z">
                  <InputNumber placeholder="0.0" step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={6}>
                <Form.Item name={['orientation', 'w']} label="W">
                  <InputNumber placeholder="1.0" step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Form.Item name="ipAddress" label="🌐 IP地址">
                <Input placeholder="例如: 192.168.1.100" style={{ borderRadius: '8px' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="port" label="🔌 端口" initialValue={80}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="status"
            label="📊 运行状态"
            rules={[{ required: true, message: '请选择状态' }]}
          >
            <Select style={{ borderRadius: '8px' }}>
              <Select.Option value="online">🟢 在线</Select.Option>
              <Select.Option value="offline">🔴 离线</Select.Option>
              <Select.Option value="maintenance">🟡 维护中</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SupplyManagement;
