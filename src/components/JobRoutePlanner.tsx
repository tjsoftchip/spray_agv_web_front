import React, { useState, useEffect, useCallback } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Button, 
  Space, 
  Tag, 
  List, 
  Empty, 
  Spin, 
  message,
  Tooltip,
  Drawer,
  Form,
  InputNumber,
  Select,
  Switch,
  Divider
} from 'antd';
import {
  EnvironmentOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  DragOutlined,
  ArrowRightOutlined,
  PlusOutlined,
  DeleteOutlined,
  SettingOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { gpsMappingApi } from '../services/gpsMappingApi';

const { Option } = Select;

// 路线点类型
interface RoutePoint {
  id: string;
  name: string;
  type: 'start' | 'waypoint' | 'turn' | 'beam_face' | 'end';
  mapX: number;
  mapY: number;
  beamId?: string;
  face?: string;
  speed?: number;
  sprayEnabled?: boolean;
}

// 路线类型
interface JobRoute {
  id: string;
  name: string;
  points: RoutePoint[];
  totalDistance: number;
  estimatedTime: number;
}

interface JobRoutePlannerProps {
  beamPositions: any[];
  value?: JobRoute;
  onChange?: (route: JobRoute) => void;
  disabled?: boolean;
}

// 可排序路线点组件
const SortableRoutePoint: React.FC<{
  point: RoutePoint;
  index: number;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
  disabled: boolean;
}> = ({ point, index, onRemove, onEdit, disabled }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: point.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'start': return <EnvironmentOutlined style={{ color: '#52c41a' }} />;
      case 'end': return <EnvironmentOutlined style={{ color: '#ff4d4f' }} />;
      case 'turn': return <ArrowRightOutlined style={{ color: '#fa8c16' }} />;
      case 'beam_face': return <CheckCircleOutlined style={{ color: '#1890ff' }} />;
      default: return <EnvironmentOutlined style={{ color: '#666' }} />;
    }
  };

  const getTypeTag = (type: string) => {
    const typeMap: { [key: string]: { color: string; text: string } } = {
      start: { color: 'green', text: '起点' },
      end: { color: 'red', text: '终点' },
      turn: { color: 'orange', text: '转弯' },
      beam_face: { color: 'blue', text: '喷淋面' },
      waypoint: { color: 'default', text: '途径点' }
    };
    const config = typeMap[type] || { color: 'default', text: type };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <List.Item
        style={{
          padding: '8px 12px',
          background: '#fafafa',
          borderRadius: 4,
          marginBottom: 4
        }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <DragOutlined {...listeners} style={{ cursor: 'grab', color: '#999' }} />
            <span style={{ fontWeight: 500 }}>{index + 1}.</span>
            {getTypeIcon(point.type)}
            <span>{point.name}</span>
            {getTypeTag(point.type)}
            {point.sprayEnabled && <Tag color="cyan">喷淋</Tag>}
          </Space>
          <Space>
            {!disabled && point.type !== 'start' && point.type !== 'end' && (
              <>
                <Button size="small" type="text" onClick={() => onEdit(point.id)}>
                  <SettingOutlined />
                </Button>
                <Button size="small" type="text" danger onClick={() => onRemove(point.id)}>
                  <DeleteOutlined />
                </Button>
              </>
            )}
          </Space>
        </Space>
      </List.Item>
    </div>
  );
};

const JobRoutePlanner: React.FC<JobRoutePlannerProps> = ({
  beamPositions,
  value,
  onChange,
  disabled = false
}) => {
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editingPoint, setEditingPoint] = useState<RoutePoint | null>(null);
  const [form] = Form.useForm();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 初始化默认起点和终点
  useEffect(() => {
    if (routePoints.length === 0) {
      setRoutePoints([
        { id: 'start_1', name: '补给站(起点)', type: 'start', mapX: 0, mapY: 0, speed: 0.3 },
        { id: 'end_1', name: '补给站(终点)', type: 'end', mapX: 0, mapY: 0, speed: 0.3 }
      ]);
    }
  }, []);

  // 计算路线统计
  const calculateRouteStats = useCallback((points: RoutePoint[]) => {
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      totalDistance += Math.sqrt(
        Math.pow(p2.mapX - p1.mapX, 2) + Math.pow(p2.mapY - p1.mapY, 2)
      );
    }
    
    // 估算时间（假设平均速度0.3m/s，加上转弯和喷淋时间）
    const avgSpeed = 0.3;
    const estimatedTime = totalDistance / avgSpeed + points.filter(p => p.type === 'beam_face').length * 120; // 每个喷淋面约2分钟
    
    return { totalDistance, estimatedTime };
  }, []);

  // 更新路线
  const updateRoute = (points: RoutePoint[]) => {
    setRoutePoints(points);
    const stats = calculateRouteStats(points);
    onChange?.({
      id: 'route_' + Date.now(),
      name: '作业路线',
      points,
      ...stats
    });
  };

  // 拖拽排序
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = routePoints.findIndex(p => p.id === active.id);
      const newIndex = routePoints.findIndex(p => p.id === over.id);
      // 不能移动起点和终点
      const movingPoint = routePoints[oldIndex];
      if (movingPoint.type === 'start' || movingPoint.type === 'end') {
        message.warning('起点和终点不能移动');
        return;
      }
      const targetPoint = routePoints[newIndex];
      if (targetPoint.type === 'start' || targetPoint.type === 'end') {
        message.warning('不能拖拽到起点或终点位置');
        return;
      }
      const newPoints = arrayMove(routePoints, oldIndex, newIndex);
      updateRoute(newPoints);
    }
  };

  // 添加梁面喷淋点
  const addBeamFacePoint = (beam: any, face: string) => {
    const newPoint: RoutePoint = {
      id: `point_${Date.now()}`,
      name: `${beam.name}-${face}面`,
      type: 'beam_face',
      mapX: beam.mapX,
      mapY: beam.mapY,
      beamId: beam.id,
      face,
      speed: 0.2,
      sprayEnabled: true
    };
    
    // 在终点前插入
    const newPoints = [...routePoints.slice(0, -1), newPoint, routePoints[routePoints.length - 1]];
    updateRoute(newPoints);
    message.success(`已添加 ${beam.name} ${face}面 喷淋点`);
  };

  // 删除路线点
  const removePoint = (id: string) => {
    const point = routePoints.find(p => p.id === id);
    if (point?.type === 'start' || point?.type === 'end') {
      message.warning('起点和终点不能删除');
      return;
    }
    updateRoute(routePoints.filter(p => p.id !== id));
  };

  // 编辑路线点
  const editPoint = (id: string) => {
    const point = routePoints.find(p => p.id === id);
    if (point) {
      setEditingPoint(point);
      form.setFieldsValue(point);
      setSettingsVisible(true);
    }
  };

  // 保存编辑
  const handleSaveEdit = async () => {
    try {
      const values = await form.validateFields();
      const newPoints = routePoints.map(p => 
        p.id === editingPoint?.id ? { ...p, ...values } : p
      );
      updateRoute(newPoints);
      setSettingsVisible(false);
      setEditingPoint(null);
      message.success('已更新路线点');
    } catch (error) {
      // 表单验证失败
    }
  };

  // 自动生成路线
  const autoGenerateRoute = async () => {
    if (beamPositions.length === 0) {
      message.warning('请先选择梁位');
      return;
    }
    
    setLoading(true);
    try {
      // 根据梁位置自动生成路线
      const newPoints: RoutePoint[] = [
        { id: 'start_1', name: '补给站(起点)', type: 'start', mapX: 0, mapY: 0, speed: 0.3 }
      ];
      
      // 按照位置排序，生成喷淋路线
      const sortedBeams = [...beamPositions].sort((a, b) => a.mapY - b.mapY);
      
      sortedBeams.forEach((beam, index) => {
        // 添加北面喷淋点
        newPoints.push({
          id: `point_${Date.now()}_${index}_n`,
          name: `${beam.name}-北面`,
          type: 'beam_face',
          mapX: beam.mapX,
          mapY: beam.mapY + beam.length / 2,
          beamId: beam.id,
          face: 'north',
          speed: 0.2,
          sprayEnabled: true
        });
        
        // 添加转弯点
        newPoints.push({
          id: `point_${Date.now()}_${index}_turn`,
          name: `转弯点${index + 1}`,
          type: 'turn',
          mapX: beam.mapX + 5,
          mapY: beam.mapY + beam.length / 2 + 5,
          speed: 0.1
        });
        
        // 添加南面喷淋点
        newPoints.push({
          id: `point_${Date.now()}_${index}_s`,
          name: `${beam.name}-南面`,
          type: 'beam_face',
          mapX: beam.mapX,
          mapY: beam.mapY - beam.length / 2,
          beamId: beam.id,
          face: 'south',
          speed: 0.2,
          sprayEnabled: true
        });
      });
      
      // 添加终点
      newPoints.push({
        id: 'end_1',
        name: '补给站(终点)',
        type: 'end',
        mapX: 0,
        mapY: 0,
        speed: 0.3
      });
      
      updateRoute(newPoints);
      message.success('已自动生成作业路线');
    } catch (error) {
      message.error('生成路线失败');
    } finally {
      setLoading(false);
    }
  };

  const stats = calculateRouteStats(routePoints);

  return (
    <div>
      <Card 
        size="small"
        title={
          <Space>
            <PlayCircleOutlined />
            <span>作业线路规划</span>
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="自动生成路线">
              <Button 
                icon={<ReloadOutlined />} 
                onClick={autoGenerateRoute}
                disabled={disabled || beamPositions.length === 0}
                size="small"
              >
                自动生成
              </Button>
            </Tooltip>
          </Space>
        }
      >
        <Spin spinning={loading}>
          {/* 统计信息 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>
                  {routePoints.length}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>路线点数</div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                  {stats.totalDistance.toFixed(1)}m
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>总距离</div>
              </div>
            </Col>
            <Col span={8}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#fa8c16' }}>
                  {Math.ceil(stats.estimatedTime / 60)}分钟
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>预估时间</div>
              </div>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          {/* 快速添加梁面 */}
          {beamPositions.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>快速添加喷淋面:</div>
              <Space wrap size={[4, 4]}>
                {beamPositions.slice(0, 5).map(beam => (
                  <React.Fragment key={beam.id}>
                    <Button 
                      size="small" 
                      onClick={() => addBeamFacePoint(beam, 'north')}
                      disabled={disabled}
                    >
                      {beam.name}-北
                    </Button>
                    <Button 
                      size="small" 
                      onClick={() => addBeamFacePoint(beam, 'south')}
                      disabled={disabled}
                    >
                      {beam.name}-南
                    </Button>
                  </React.Fragment>
                ))}
              </Space>
            </div>
          )}

          {/* 路线点列表 */}
          {routePoints.length === 0 ? (
            <Empty description="暂无路线点" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={routePoints.map(p => p.id)} strategy={verticalListSortingStrategy}>
                <List
                  size="small"
                  dataSource={routePoints}
                  renderItem={(point, index) => (
                    <SortableRoutePoint
                      key={point.id}
                      point={point}
                      index={index}
                      onRemove={removePoint}
                      onEdit={editPoint}
                      disabled={disabled}
                    />
                  )}
                  style={{ maxHeight: 400, overflow: 'auto' }}
                />
              </SortableContext>
            </DndContext>
          )}
        </Spin>
      </Card>

      {/* 路线点设置抽屉 */}
      <Drawer
        title="路线点设置"
        placement="right"
        width={400}
        open={settingsVisible}
        onClose={() => {
          setSettingsVisible(false);
          setEditingPoint(null);
        }}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setSettingsVisible(false)}>取消</Button>
            <Button type="primary" onClick={handleSaveEdit}>保存</Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称">
            <InputNumber style={{ width: '100%' }} disabled />
          </Form.Item>
          
          <Form.Item name="speed" label="速度 (m/s)" initialValue={0.2}>
            <InputNumber min={0.1} max={0.5} step={0.05} style={{ width: '100%' }} />
          </Form.Item>
          
          {editingPoint?.type === 'beam_face' && (
            <Form.Item name="sprayEnabled" label="启用喷淋" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Drawer>
    </div>
  );
};

export default JobRoutePlanner;
