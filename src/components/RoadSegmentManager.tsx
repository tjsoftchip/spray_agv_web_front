import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Switch, Select, InputNumber, message, Popconfirm, Row, Col, Divider } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ThunderboltOutlined } from '@ant-design/icons';

interface RoadSegmentManagerProps {
  templateId: string;
  roadSegments: any[];
  navigationPoints: any[];
  onUpdate: () => void;
}

const RoadSegmentManager: React.FC<RoadSegmentManagerProps> = ({ 
  templateId,
  roadSegments, 
  navigationPoints,
  onUpdate 
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSegment, setEditingSegment] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    // 当导航点变化时，可以提示用户生成路段
    if (navigationPoints.length >= 2 && roadSegments.length === 0) {
      message.info('检测到有导航点，可以自动生成路段');
    }
  }, [navigationPoints, roadSegments]);

  const handleCreate = () => {
    setEditingSegment(null);
    form.resetFields();
    form.setFieldsValue({
      sprayParams: {
        pumpStatus: true,
        leftArmStatus: 'open',
        rightArmStatus: 'open',
        leftValveStatus: true,
        rightValveStatus: true,
        armHeight: 1.8,
      },
      operationSpeed: 0.35,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingSegment(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleGenerateSegments = async () => {
    if (navigationPoints.length < 2) {
      message.warning('至少需要2个导航点才能生成路段');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/templates/${templateId}/road-segments/generate`, {
        method: 'POST',
      });
      
      if (response.ok) {
        const data = await response.json();
        message.success(`已生成 ${data.length} 个路段`);
        onUpdate();
      } else {
        throw new Error('Generate failed');
      }
    } catch (error) {
      message.error('生成路段失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${templateId}/road-segments/${id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        message.success('删除成功');
        onUpdate();
      } else {
        throw new Error('Delete failed');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      
      let response;
      if (editingSegment) {
        response = await fetch(`/api/templates/${templateId}/road-segments/${editingSegment.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
      } else {
        response = await fetch(`/api/templates/${templateId}/road-segments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        });
      }
      
      if (response.ok) {
        message.success(editingSegment ? '更新成功' : '创建成功');
        setModalVisible(false);
        onUpdate();
      } else {
        throw new Error('Save failed');
      }
    } catch (error) {
      message.error('操作失败');
    } finally {
      setLoading(false);
    }
  };

  const getNavPointName = (id: string) => {
    const point = navigationPoints.find((p) => p.id === id);
    return point ? point.name : id;
  };

  const columns = [
    {
      title: '路段',
      key: 'segment',
      render: (_: any, record: any, index: number) => `路段 ${index + 1}`,
    },
    {
      title: '起点',
      dataIndex: 'startNavPointId',
      key: 'startNavPointId',
      render: (id: string) => {
        const point = navigationPoints.find(p => p.id === id);
        return point ? `${point.name} (顺序${point.order})` : id;
      },
    },
    {
      title: '终点',
      dataIndex: 'endNavPointId',
      key: 'endNavPointId',
      render: (id: string) => {
        const point = navigationPoints.find(p => p.id === id);
        return point ? `${point.name} (顺序${point.order})` : id;
      },
    },
    {
      title: '水泵',
      key: 'pumpStatus',
      render: (_: any, record: any) => (
        <span style={{ color: record.sprayParams.pumpStatus ? '#52c41a' : '#999' }}>
          {record.sprayParams.pumpStatus ? '开启' : '关闭'}
        </span>
      ),
    },
    {
      title: '左臂/阀门',
      key: 'leftArm',
      render: (_: any, record: any) => {
        const statusMap: any = {
          open: '展开',
          close: '收起',
          adjusting: '调整中',
        };
        return (
          <div>
            <div>{statusMap[record.sprayParams.leftArmStatus] || record.sprayParams.leftArmStatus}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              阀门: {record.sprayParams.leftValveStatus ? '开启' : '关闭'}
            </div>
          </div>
        );
      },
    },
    {
      title: '右臂/阀门',
      key: 'rightArm',
      render: (_: any, record: any) => {
        const statusMap: any = {
          open: '展开',
          close: '收起',
          adjusting: '调整中',
        };
        return (
          <div>
            <div>{statusMap[record.sprayParams.rightArmStatus] || record.sprayParams.rightArmStatus}</div>
            <div style={{ fontSize: '12px', color: '#666' }}>
              阀门: {record.sprayParams.rightValveStatus ? '开启' : '关闭'}
            </div>
          </div>
        );
      },
    },
    {
      title: '支架高度',
      key: 'armHeight',
      render: (_: any, record: any) => 
        `${record.sprayParams.armHeight.toFixed(2)}m`,
    },
    {
      title: '作业速度',
      dataIndex: 'operationSpeed',
      key: 'operationSpeed',
      render: (speed: number) => `${speed.toFixed(2)}m/s`,
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button 
            type="link" 
            size="small"
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此路段吗？"
            onConfirm={() => handleDelete(record.id)}
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
    <Card 
      title="路段喷淋参数管理" 
      extra={
        <Space>
          {navigationPoints.length >= 2 && (
            <Button 
              type="default" 
              size="small" 
              icon={<ThunderboltOutlined />} 
              onClick={handleGenerateSegments}
              loading={loading}
            >
              自动生成路段
            </Button>
          )}
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>
            手动添加路段
          </Button>
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={roadSegments}
        rowKey="id"
        pagination={false}
        size="small"
      />

      <Modal
        title={editingSegment ? '编辑路段' : '添加路段'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        confirmLoading={loading}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="startNavPointId"
                label="起点"
                rules={[{ required: true, message: '请选择起点' }]}
              >
                <Select placeholder="选择起点导航点">
                  {navigationPoints.map((point) => (
                    <Select.Option key={point.id} value={point.id}>
                      {point.name} (顺序{point.order})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="endNavPointId"
                label="终点"
                rules={[{ required: true, message: '请选择终点' }]}
              >
                <Select placeholder="选择终点导航点">
                  {navigationPoints.map((point) => (
                    <Select.Option key={point.id} value={point.id}>
                      {point.name} (顺序{point.order})
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Divider>喷淋参数配置</Divider>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                name={['sprayParams', 'pumpStatus']}
                label="水泵状态"
                valuePropName="checked"
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name={['sprayParams', 'leftValveStatus']}
                label="左侧水阀"
                valuePropName="checked"
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                name={['sprayParams', 'rightValveStatus']}
                label="右侧水阀"
                valuePropName="checked"
              >
                <Switch checkedChildren="开启" unCheckedChildren="关闭" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name={['sprayParams', 'leftArmStatus']}
                label="左侧臂状态"
                rules={[{ required: true }]}
              >
                <Select>
                  <Select.Option value="open">展开</Select.Option>
                  <Select.Option value="close">收起</Select.Option>
                  <Select.Option value="adjusting">调整中</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name={['sprayParams', 'rightArmStatus']}
                label="右侧臂状态"
                rules={[{ required: true }]}
              >
                <Select>
                  <Select.Option value="open">展开</Select.Option>
                  <Select.Option value="close">收起</Select.Option>
                  <Select.Option value="adjusting">调整中</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name={['sprayParams', 'armHeight']}
                label="支架高度(米)"
                rules={[{ required: true, message: '请输入支架高度' }]}
              >
                <InputNumber 
                  min={0.5} 
                  max={3.0} 
                  step={0.1} 
                  style={{ width: '100%' }}
                  placeholder="输入支架高度"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="operationSpeed"
                label="作业速度(米/秒)"
                rules={[{ required: true, message: '请输入作业速度' }]}
              >
                <InputNumber 
                  min={0.1} 
                  max={1.0} 
                  step={0.05} 
                  style={{ width: '100%' }}
                  placeholder="输入作业速度"
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

export default RoadSegmentManager;
