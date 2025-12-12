import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Progress, Button, Space, Statistic, Tag, message, Modal, Form, Input, InputNumber, Select, Table, Popconfirm } from 'antd';
import { ThunderboltOutlined, ExperimentOutlined, EnvironmentOutlined, PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { socketService } from '../services/socket';
import { supplyStationApi } from '../services/api';

const SupplyManagement: React.FC = () => {
  const [supplyStatus, setSupplyStatus] = useState({
    status: 'idle',
    waterLevel: 100,
    batteryLevel: 100,
    waterThreshold: 10,
    batteryThreshold: 20,
    chargingEnabled: true,
    wateringEnabled: true,
  });
  const [stations, setStations] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStation, setEditingStation] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    socketService.connect();
    loadStations();

    socketService.on('ros_message', (data) => {
      if (data.topic === '/supply_status') {
        const status = JSON.parse(data.msg.data);
        setSupplyStatus(status);
      }
    });

    return () => {
      socketService.off('ros_message');
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

  const sendSupplyCommand = (action: string) => {
    socketService.sendRosCommand({
      op: 'publish',
      topic: '/supply_command',
      msg: { data: JSON.stringify({ action }) },
      type: 'std_msgs/String',
    });
  };

  const handleStartSupply = () => {
    sendSupplyCommand('start_supply');
    message.success('开始补给');
  };

  const handleStopSupply = () => {
    sendSupplyCommand('stop_supply');
    message.success('停止补给');
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

  const getWaterColor = (level: number) => {
    if (level < supplyStatus.waterThreshold) return '#ff4d4f';
    if (level < 30) return '#faad14';
    return '#1890ff';
  };

  const getBatteryColor = (level: number) => {
    if (level < supplyStatus.batteryThreshold) return '#ff4d4f';
    if (level < 30) return '#faad14';
    return '#52c41a';
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
    <div>
      <h2>补给管理</h2>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card>
            <Statistic
              title="水位"
              value={supplyStatus.waterLevel}
              suffix="%"
              prefix={<ExperimentOutlined />}
              valueStyle={{ color: getWaterColor(supplyStatus.waterLevel) }}
            />
            <Progress
              percent={supplyStatus.waterLevel}
              strokeColor={getWaterColor(supplyStatus.waterLevel)}
              style={{ marginTop: 16 }}
            />
            <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
              低水位阈值: {supplyStatus.waterThreshold}%
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card>
            <Statistic
              title="电池电量"
              value={supplyStatus.batteryLevel}
              suffix="%"
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: getBatteryColor(supplyStatus.batteryLevel) }}
            />
            <Progress
              percent={supplyStatus.batteryLevel}
              strokeColor={getBatteryColor(supplyStatus.batteryLevel)}
              style={{ marginTop: 16 }}
            />
            <div style={{ marginTop: 8, color: '#999', fontSize: 12 }}>
              低电量阈值: {supplyStatus.batteryThreshold}%
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, color: '#999', marginBottom: 8 }}>补给状态</div>
              <div>{getStatusTag(supplyStatus.status)}</div>
            </div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>充电功能</span>
                <Tag color={supplyStatus.chargingEnabled ? 'success' : 'default'}>
                  {supplyStatus.chargingEnabled ? '已启用' : '未启用'}
                </Tag>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>注水功能</span>
                <Tag color={supplyStatus.wateringEnabled ? 'success' : 'default'}>
                  {supplyStatus.wateringEnabled ? '已启用' : '未启用'}
                </Tag>
              </div>
            </Space>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="补给控制" bordered={false}>
            <Space size="large" wrap>
              <Button
                type="primary"
                size="large"
                onClick={handleStartSupply}
                disabled={supplyStatus.status !== 'idle'}
              >
                开始自动补给
              </Button>
              <Button
                danger
                size="large"
                onClick={handleStopSupply}
                disabled={supplyStatus.status === 'idle'}
              >
                停止补给
              </Button>
              <Button
                icon={<EnvironmentOutlined />}
                size="large"
                onClick={handleNavigateToStation}
                disabled={supplyStatus.status !== 'idle'}
              >
                导航到补给站
              </Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="充电控制" bordered={false}>
            <Space>
              <Button
                type="primary"
                onClick={handleStartCharging}
                disabled={!supplyStatus.chargingEnabled}
              >
                开始充电
              </Button>
              <Button onClick={handleStopCharging}>停止充电</Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="注水控制" bordered={false}>
            <Space>
              <Button
                type="primary"
                onClick={handleStartWatering}
                disabled={!supplyStatus.wateringEnabled}
              >
                开始注水
              </Button>
              <Button onClick={handleStopWatering}>停止注水</Button>
            </Space>
          </Card>
        </Col>

        <Col xs={24}>
          <Card title="提示信息" bordered={false}>
            <div style={{ color: '#999' }}>
              <p>• 当水位低于 {supplyStatus.waterThreshold}% 或电量低于 {supplyStatus.batteryThreshold}% 时，系统会自动触发补给流程</p>
              <p>• 补给过程中会自动导航到补给站、对齐位置、进行充电和注水</p>
              <p>• 可以手动控制充电和注水功能的开启与关闭</p>
            </div>
          </Card>
        </Col>

        <Col xs={24}>
          <Card 
            title="补给站管理" 
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateStation}>
                添加补给站
              </Button>
            }
          >
            <Table
              columns={stationColumns}
              dataSource={stations}
              rowKey="id"
              pagination={false}
              size="small"
              style={{ width: '100%' }}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>
      </Row>

      <Modal
        title={editingStation ? '编辑补给站' : '添加补给站'}
        open={modalVisible}
        onOk={handleSubmitStation}
        onCancel={() => setModalVisible(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="补给站名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="例如: 主补给站" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="补给站描述" />
          </Form.Item>

          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select>
              <Select.Option value="water">仅注水</Select.Option>
              <Select.Option value="charge">仅充电</Select.Option>
              <Select.Option value="combined">综合补给</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="位置">
            <Space>
              <Form.Item name={['position', 'x']} noStyle rules={[{ required: true }]}>
                <InputNumber placeholder="X坐标" step={0.1} />
              </Form.Item>
              <Form.Item name={['position', 'y']} noStyle rules={[{ required: true }]}>
                <InputNumber placeholder="Y坐标" step={0.1} />
              </Form.Item>
              <Form.Item name={['position', 'z']} noStyle rules={[{ required: true }]}>
                <InputNumber placeholder="Z坐标" step={0.1} />
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item label="朝向">
            <Space>
              <Form.Item name={['orientation', 'x']} noStyle>
                <InputNumber placeholder="X" step={0.1} style={{ width: 80 }} />
              </Form.Item>
              <Form.Item name={['orientation', 'y']} noStyle>
                <InputNumber placeholder="Y" step={0.1} style={{ width: 80 }} />
              </Form.Item>
              <Form.Item name={['orientation', 'z']} noStyle>
                <InputNumber placeholder="Z" step={0.1} style={{ width: 80 }} />
              </Form.Item>
              <Form.Item name={['orientation', 'w']} noStyle>
                <InputNumber placeholder="W" step={0.1} style={{ width: 80 }} />
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item name="ipAddress" label="IP地址">
            <Input placeholder="例如: 192.168.1.100" />
          </Form.Item>

          <Form.Item name="port" label="端口" initialValue={80}>
            <InputNumber min={1} max={65535} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="status"
            label="状态"
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="online">在线</Select.Option>
              <Select.Option value="offline">离线</Select.Option>
              <Select.Option value="maintenance">维护中</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SupplyManagement;
