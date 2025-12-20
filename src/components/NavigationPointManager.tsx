import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, InputNumber, Select, message, Popconfirm, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined, AimOutlined, RocketOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import PGMMapViewer from './PGMMapViewer';
import { apiService } from '../services/api';
import { navigationApi } from '../services/navigationApi';

interface NavigationPointManagerProps {
  templateId: string;
  navigationPoints: any[];
  onUpdate: () => void;
  mapId?: string;
}

const NavigationPointManager: React.FC<NavigationPointManagerProps> = ({ templateId, navigationPoints, onUpdate, mapId }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [mapSelectVisible, setMapSelectVisible] = useState(false);
  const [editingPoint, setEditingPoint] = useState<any>(null);
  const [robotPosition, setRobotPosition] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [localPoints, setLocalPoints] = useState<any[]>(navigationPoints);
  const [form] = Form.useForm();

  // 监听 props 变化，更新本地状态
  useEffect(() => {
    setLocalPoints([...navigationPoints]);
  }, [JSON.stringify(navigationPoints)]);

  useEffect(() => {
    // 可以在这里加载默认地图或机器人位置
    loadRobotPosition();
  }, []);

  const loadRobotPosition = async () => {
    try {
      const data = await apiService.get('/templates/robot/current-position');
      setRobotPosition(data.position);
    } catch (error) {
      console.error('Failed to load robot position:', error);
    }
  };

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
      order: navigationPoints.length + 1,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingPoint(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const result = await apiService.delete(`/templates/${templateId}/navigation-points/${id}`);
      await onUpdate();
      
      if (result.deletedSegmentsCount > 0) {
        message.success(`删除成功，同时删除了 ${result.deletedSegmentsCount} 个相关路段`);
      } else {
        message.success('删除成功');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const handleTestNavigation = async (point: any) => {
    if (!templateId) {
      message.error('模板ID不存在');
      return;
    }

    console.log('[Navigation Test]', {
      templateId,
      pointId: point.id,
      pointName: point.name,
      position: point.position
    });

    try {
      setLoading(true);
      await navigationApi.gotoPoint(templateId, point.id);
      message.success(`开始导航到 ${point.name}`);
    } catch (error) {
      console.error('[Navigation Test Error]', error);
      message.error('导航测试失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      
      if (editingPoint) {
        await apiService.put(`/templates/${templateId}/navigation-points/${editingPoint.id}`, values);
      } else {
        await apiService.post(`/templates/${templateId}/navigation-points`, values);
      }
      
      await onUpdate();
      setModalVisible(false);
      message.success(editingPoint ? '更新成功' : '创建成功');
    } catch (error) {
      console.error('操作失败:', error);
      message.error('操作失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGetCurrentPosition = async () => {
    try {
      const data = await apiService.get('/templates/robot/current-position');
      
      form.setFieldsValue({
        position: data.position,
      });
      
      setRobotPosition(data.position);
      message.success('已获取当前机器人位置');
    } catch (error) {
      message.error('获取当前位置失败');
    }
  };

  const handleMapSelect = () => {
    setMapSelectVisible(true);
  };

  const handleMapClick = (position: { x: number; y: number }) => {
    // 确保坐标是有效的数字
    const x = typeof position.x === 'number' && !isNaN(position.x) ? position.x : 0;
    const y = typeof position.y === 'number' && !isNaN(position.y) ? position.y : 0;
    
    form.setFieldsValue({
      position: { x, y, z: 0 },
    });
    setMapSelectVisible(false);
    message.success(`位置已设置: (${x.toFixed(2)}, ${y.toFixed(2)})`);
  };

  const handleReorder = async (pointIds: string[]) => {
    try {
      await apiService.put(`/templates/${templateId}/navigation-points/reorder`, { pointIds });
      message.success('顺序已更新');
      onUpdate();
    } catch (error) {
      message.error('更新顺序失败');
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localPoints.findIndex((p) => p.id === active.id);
      const newIndex = localPoints.findIndex((p) => p.id === over.id);
      const reorderedPoints = arrayMove(localPoints, oldIndex, newIndex).map((p, index) => ({
        ...p,
        order: index + 1,
      }));
      
      // 立即更新本地状态，提供即时反馈
      setLocalPoints(reorderedPoints);
      
      const pointIds = reorderedPoints.map(p => p.id);
      handleReorder(pointIds);
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
            icon={<RocketOutlined />} 
            onClick={() => handleTestNavigation(record)}
          >
            测试导航
          </Button>
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
        <SortableContext items={localPoints.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <Table
            columns={columns}
            dataSource={localPoints}
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
        confirmLoading={loading}
        width={800}
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

          <Form.Item label="位置设置方式">
            <Row gutter={8}>
              <Col span={12}>
                <Button 
                  icon={<EnvironmentOutlined />} 
                  onClick={handleGetCurrentPosition}
                  block
                >
                  获取当前位置
                </Button>
              </Col>
              <Col span={12}>
                <Button 
                  icon={<AimOutlined />} 
                  onClick={handleMapSelect}
                  block
                >
                  地图点选
                </Button>
              </Col>
            </Row>
          </Form.Item>

          <Form.Item label="坐标位置">
            <Row gutter={8}>
              <Col span={8}>
                <Form.Item name={['position', 'x']} rules={[{ required: true, message: '请输入X坐标' }]}>
                  <InputNumber 
                    placeholder="X坐标" 
                    step={0.1} 
                    style={{ width: '100%' }}
                    size="large"
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name={['position', 'y']} rules={[{ required: true, message: '请输入Y坐标' }]}>
                  <InputNumber 
                    placeholder="Y坐标" 
                    step={0.1} 
                    style={{ width: '100%' }}
                    size="large"
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name={['position', 'z']} rules={[{ required: true, message: '请输入Z坐标' }]}>
                  <InputNumber 
                    placeholder="Z坐标" 
                    step={0.1} 
                    style={{ width: '100%' }}
                    size="large"
                  />
                </Form.Item>
              </Col>
            </Row>
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
        width={1000}
      >
        <PGMMapViewer
          navigationPoints={navigationPoints}
          onMapClick={handleMapClick}
          robotPosition={robotPosition || undefined}
          selectedMapId={mapId}
          showMapSelector={true}
          height="600px"
        />
      </Modal>
    </Card>
  );
};

export default NavigationPointManager;
