import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Switch, Select, InputNumber, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';

interface RoadSegmentManagerProps {
  templateId: string;
  roadSegments: any[];
  navigationPoints: any[];
  onUpdate: () => void;
}

const RoadSegmentManager: React.FC<RoadSegmentManagerProps> = ({ 
  roadSegments, 
  navigationPoints,
  onUpdate 
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSegment, setEditingSegment] = useState<any>(null);
  const [form] = Form.useForm();

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

  const handleDelete = async (_id: string) => {
    message.success('删除成功');
    onUpdate();
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields();
      message.success(editingSegment ? '更新成功' : '创建成功');
      setModalVisible(false);
      onUpdate();
    } catch (error: any) {
      message.error('操作失败');
    }
  };

  const getNavPointName = (id: string) => {
    const point = navigationPoints.find((p) => p.id === id);
    return point ? point.name : id;
  };

  const columns = [
    {
      title: '起点',
      dataIndex: 'startNavPointId',
      key: 'startNavPointId',
      render: (id: string) => getNavPointName(id),
    },
    {
      title: '终点',
      dataIndex: 'endNavPointId',
      key: 'endNavPointId',
      render: (id: string) => getNavPointName(id),
    },
    {
      title: '水泵',
      key: 'pumpStatus',
      render: (_: any, record: any) => 
        record.sprayParams.pumpStatus ? '开启' : '关闭',
    },
    {
      title: '左臂',
      key: 'leftArmStatus',
      render: (_: any, record: any) => {
        const statusMap: any = {
          open: '展开',
          close: '收起',
          adjusting: '调整中',
        };
        return statusMap[record.sprayParams.leftArmStatus] || record.sprayParams.leftArmStatus;
      },
    },
    {
      title: '右臂',
      key: 'rightArmStatus',
      render: (_: any, record: any) => {
        const statusMap: any = {
          open: '展开',
          close: '收起',
          adjusting: '调整中',
        };
        return statusMap[record.sprayParams.rightArmStatus] || record.sprayParams.rightArmStatus;
      },
    },
    {
      title: '支架高度(m)',
      key: 'armHeight',
      render: (_: any, record: any) => 
        record.sprayParams.armHeight.toFixed(2),
    },
    {
      title: '作业速度(m/s)',
      dataIndex: 'operationSpeed',
      key: 'operationSpeed',
      render: (speed: number) => speed.toFixed(2),
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
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>
          添加路段
        </Button>
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
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="startNavPointId"
            label="起点"
            rules={[{ required: true, message: '请选择起点' }]}
          >
            <Select placeholder="选择起点导航点">
              {navigationPoints.map((point) => (
                <Select.Option key={point.id} value={point.id}>
                  {point.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="endNavPointId"
            label="终点"
            rules={[{ required: true, message: '请选择终点' }]}
          >
            <Select placeholder="选择终点导航点">
              {navigationPoints.map((point) => (
                <Select.Option key={point.id} value={point.id}>
                  {point.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Card title="喷淋参数配置" size="small" style={{ marginBottom: 16 }}>
            <Form.Item
              name={['sprayParams', 'pumpStatus']}
              label="水泵状态"
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>

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

            <Form.Item
              name={['sprayParams', 'leftValveStatus']}
              label="左侧水阀状态"
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>

            <Form.Item
              name={['sprayParams', 'rightValveStatus']}
              label="右侧水阀状态"
              valuePropName="checked"
            >
              <Switch checkedChildren="开启" unCheckedChildren="关闭" />
            </Form.Item>

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
          </Card>

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
        </Form>
      </Modal>
    </Card>
  );
};

export default RoadSegmentManager;
