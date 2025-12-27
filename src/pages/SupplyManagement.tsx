import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Progress, Button, Space, Statistic, Tag, message, Modal, Form, Input, InputNumber, Select, Table, Popconfirm, Switch } from 'antd';
import { ThunderboltOutlined, ExperimentOutlined, EnvironmentOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
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
  const [stations, setStations] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStation, setEditingStation] = useState<any>(null);
  const [availablePoints, setAvailablePoints] = useState<any[]>([]);
  const [gpuMetrics, setGpuMetrics] = useState<any>(null);
  const [systemMetrics, setSystemMetrics] = useState<any>(null);
  const [taskStatus, setTaskStatus] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    socketService.connect();
    loadStations();
    loadAvailablePoints();
    loadGPUMetrics();
    loadSystemMetrics();
    loadTaskStatus();

    // 定期刷新数据
    const interval = setInterval(() => {
      loadGPUMetrics();
      loadSystemMetrics();
      loadTaskStatus();
    }, 5000);

    socketService.on('ros_message', (data) => {
      if (data.topic === '/supply_status') {
        const status = JSON.parse(data.msg.data);
        setSupplyStatus(prev => ({ ...prev, ...status }));
        
        // 自动补给逻辑
        if (prev.autoSupplyEnabled && prev.status === 'idle') {
          const needSupply = status.waterLevel < prev.waterThreshold || 
                           status.batteryLevel < prev.batteryThreshold;
          
          if (needSupply) {
            console.log('自动触发补给流程');
            handleStartSupply();
          }
        }
      }
    });

    return () => {
      socketService.off('ros_message');
      clearInterval(interval);
    };
  }, []);

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
        position: currentPosition.position,
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

  const handleStartCharging = () => {
    sendSupplyCommand('start_charging');
    message.success('开始充电');
  };

  const handleStopCharging = () => {
    sendSupplyCommand('stop_charging');
    message.success('停止充电');
  };

  const handleStartWatering = () => {
    sendSupplyCommand('start_watering');
    message.success('开始注水');
  };

  const handleStopWatering = () => {
    sendSupplyCommand('stop_watering');
    message.success('停止注水');
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
                  <Row gutter={[8, 8]}>
                    <Col xs={12}>
                      <Button
                        type="primary"
                        block
                        onClick={handleStartCharging}
                        disabled={!supplyStatus.chargingEnabled}
                        style={{ height: '40px' }}
                      >
                        开始充电
                      </Button>
                    </Col>
                    <Col xs={12}>
                      <Button
                        block
                        onClick={handleStopCharging}
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
                  <Row gutter={[8, 8]}>
                    <Col xs={12}>
                      <Button
                        type="primary"
                        block
                        onClick={handleStartWatering}
                        disabled={!supplyStatus.wateringEnabled}
                        style={{ height: '40px' }}
                      >
                        开始注水
                      </Button>
                    </Col>
                    <Col xs={12}>
                      <Button
                        block
                        onClick={handleStopWatering}
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
