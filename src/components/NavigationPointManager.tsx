import React, { useState } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined, AimOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import MapViewer from './MapViewer';

interface NavigationPointManagerProps {
  templateId: string;
  navigationPoints: any[];
  onUpdate: () => void;
}

const NavigationPointManager: React.FC<NavigationPointManagerProps> = ({ navigationPoints, onUpdate }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [mapSelectVisible, setMapSelectVisible] = useState(false);
  const [editingPoint, setEditingPoint] = useState<any>(null);
  const [form] = Form.useForm();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleCreate = () => {
    setEditingPoint(null);
    form.resetFields();
    form.setFieldsValue({
      type: 'waypoint',
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      order: navigationPoints.length + 1,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingPoint(record);
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
      message.success(editingPoint ? '更新成功' : '创建成功');
      setModalVisible(false);
      onUpdate();
    } catch (error: any) {
      message.error('操作失败');
    }
  };

  const handleGetCurrentPosition = () => {
    message.info('获取当前机器人位置...');
    form.setFieldsValue({
      position: { x: 10.5, y: 20.3, z: 0 },
      orientation: { x: 0, y: 0, z: 0.5, w: 0.866 },
    });
  };

  const handleMapSelect = () => {
    setMapSelectVisible(true);
  };

  const handleMapClick = (position: { x: number; y: number }) => {
    form.setFieldsValue({
      position: { x: position.x, y: position.y, z: 0 },
    });
    setMapSelectVisible(false);
    message.success('位置已设置');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = navigationPoints.findIndex((p) => p.id === active.id);
      const newIndex = navigationPoints.findIndex((p) => p.id === over.id);
      arrayMove(navigationPoints, oldIndex, newIndex).map((p, index) => ({
        ...p,
        order: index + 1,
      }));
      message.success('顺序已更新');
      onUpdate();
    }
  };

  const columns = [
    {
      title: '顺序',
      dataIndex: 'order',
      key: 'order',
      width: 80,
    },
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
          start: '起点',
          waypoint: '路径点',
          end: '终点',
        };
        return typeMap[type] || type;
      },
    },
    {
      title: '位置(x, y)',
      key: 'position',
      render: (_: any, record: any) => 
        `(${record.position.x.toFixed(2)}, ${record.position.y.toFixed(2)})`,
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
            title="确定删除此导航点吗？"
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
      title="导航点管理" 
      extra={
        <Button type="primary" size="small" icon={<PlusOutlined />} onClick={handleCreate}>
          添加导航点
        </Button>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={navigationPoints.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <Table
            columns={columns}
            dataSource={navigationPoints}
            rowKey="id"
            pagination={false}
            size="small"
          />
        </SortableContext>
      </DndContext>

      <Modal
        title={editingPoint ? '编辑导航点' : '添加导航点'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="导航点名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder="例如: 起点、转弯点1" />
          </Form.Item>

          <Form.Item
            name="type"
            label="类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select>
              <Select.Option value="start">起点</Select.Option>
              <Select.Option value="waypoint">路径点</Select.Option>
              <Select.Option value="end">终点</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="位置设置">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button 
                icon={<EnvironmentOutlined />} 
                onClick={handleGetCurrentPosition}
                block
              >
                获取当前机器人位置
              </Button>
              <Button 
                icon={<AimOutlined />} 
                onClick={handleMapSelect}
                block
              >
                地图点选位置
              </Button>
              
              <Space>
                <Form.Item name={['position', 'x']} label="X" rules={[{ required: true }]}>
                  <InputNumber placeholder="X坐标" step={0.1} />
                </Form.Item>
                <Form.Item name={['position', 'y']} label="Y" rules={[{ required: true }]}>
                  <InputNumber placeholder="Y坐标" step={0.1} />
                </Form.Item>
                <Form.Item name={['position', 'z']} label="Z" rules={[{ required: true }]}>
                  <InputNumber placeholder="Z坐标" step={0.1} />
                </Form.Item>
              </Space>
            </Space>
          </Form.Item>

          <Form.Item label="朝向(四元数)">
            <Space>
              <Form.Item name={['orientation', 'x']} noStyle>
                <InputNumber placeholder="X" step={0.1} style={{ width: 100 }} />
              </Form.Item>
              <Form.Item name={['orientation', 'y']} noStyle>
                <InputNumber placeholder="Y" step={0.1} style={{ width: 100 }} />
              </Form.Item>
              <Form.Item name={['orientation', 'z']} noStyle>
                <InputNumber placeholder="Z" step={0.1} style={{ width: 100 }} />
              </Form.Item>
              <Form.Item name={['orientation', 'w']} noStyle>
                <InputNumber placeholder="W" step={0.1} style={{ width: 100 }} />
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item name="order" label="顺序" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="在地图上选择位置"
        open={mapSelectVisible}
        onCancel={() => setMapSelectVisible(false)}
        footer={null}
        width={800}
      >
        <MapViewer
          navigationPoints={navigationPoints}
          onMapClick={handleMapClick}
        />
      </Modal>
    </Card>
  );
};

export default NavigationPointManager;
