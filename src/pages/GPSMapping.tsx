import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Card, 
  Row, 
  Col, 
  Button, 
  Space, 
  message, 
  Modal, 
  Form, 
  Input, 
  InputNumber,
  Table,
  Tag,
  Divider,
  Steps,
  Select,
  Tooltip,
  Popconfirm,
  List,
  Badge,
  Statistic
} from 'antd';
import {
  EnvironmentOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  SaveOutlined,
  ReloadOutlined,
  DeleteOutlined,
  PlusOutlined,
  CheckOutlined,
  AimOutlined,
  SwapOutlined,
  DragOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  FullscreenOutlined,
  DownloadOutlined
} from '@ant-design/icons';
import GPSStatusCard from '../components/GPSStatusCard';
import { socketService } from '../services/socket';
import { gpsMappingApi } from '../services/gpsMappingApi';

const { Option } = Select;

// GPS数据类型
interface GPSData {
  latitude: number;
  longitude: number;
  altitude: number;
  quality: number;
  satellites: number;
  hdop: number;
  heading: number;
  speed: number;
  timestamp: number;
}

// 路线点类型
interface RoutePoint {
  id: string;
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
  type: 'waypoint' | 'turn_point' | 'beam_marker';
  beamId?: string;
  description?: string;
}

// 梁位置类型
interface BeamPosition {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
  length: number;
  width: number;
  faces: {
    north?: string;
    south?: string;
    east?: string;
    west?: string;
  };
}

// 建图状态
type MappingPhase = 'idle' | 'preparing' | 'recording' | 'processing' | 'completed';

const GPSMapping: React.FC = () => {
  // GPS状态
  const [gpsData, setGpsData] = useState<GPSData | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // 建图状态
  const [mappingPhase, setMappingPhase] = useState<MappingPhase>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  
  // 路线数据
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [beamPositions, setBeamPositions] = useState<BeamPosition[]>([]);
  const [selectedPoint, setSelectedPoint] = useState<RoutePoint | null>(null);
  
  // 地图参数
  const [originLatitude, setOriginLatitude] = useState<number>(0);
  const [originLongitude, setOriginLongitude] = useState<number>(0);
  const [mapRotation, setMapRotation] = useState<number>(0);
  
  // UI状态
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [beamModalVisible, setBeamModalVisible] = useState(false);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [beamForm] = Form.useForm();
  
  // Canvas相关
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 统计数据
  const [stats, setStats] = useState({
    totalPoints: 0,
    turnPoints: 0,
    beamMarkers: 0,
    distance: 0
  });

  // 初始化
  useEffect(() => {
    // 连接WebSocket
    socketService.connect();
    
    // 订阅GPS话题
    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/gps/fix',
      type: 'sensor_msgs/NavSatFix'
    });
    
    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/gps/quality',
      type: 'std_msgs/Int8'
    });
    
    // 订阅GPS状态（包含卫星数和HDOP）
    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/gps/status',
      type: 'std_msgs/String'
    });
    
    // 监听GPS数据
    socketService.on('ros_message', (data: any) => {
      if (data.topic === '/gps/fix') {
        handleGPSData(data.msg);
      } else if (data.topic === '/gps/quality') {
        handleGPSQuality(data.msg);
      } else if (data.topic === '/gps/status') {
        handleGPSStatus(data.msg);
      }
    });

    // 加载已保存的数据
    loadSavedData();

    return () => {
      socketService.off('ros_message');
      socketService.sendRosCommand({ op: 'unsubscribe', topic: '/gps/fix' });
      socketService.sendRosCommand({ op: 'unsubscribe', topic: '/gps/quality' });
      socketService.sendRosCommand({ op: 'unsubscribe', topic: '/gps/status' });
    };
  }, []);

  // 处理GPS数据
  const handleGPSData = useCallback((msg: any) => {
    setGpsData(prev => ({
      ...prev,
      latitude: msg.latitude,
      longitude: msg.longitude,
      altitude: msg.altitude,
      timestamp: Date.now()
    } as GPSData));
  }, []);

  // 处理GPS质量数据
  const handleGPSQuality = useCallback((msg: any) => {
    setGpsData(prev => ({
      ...prev,
      quality: msg.data || msg.quality,
      satellites: msg.satellites || prev?.satellites || 0,
      hdop: msg.hdop || prev?.hdop || 0,
      heading: msg.heading || prev?.heading || 0,
      speed: msg.speed || prev?.speed || 0
    } as GPSData));
  }, []);
  
  // 处理GPS状态数据（JSON格式，包含卫星数和HDOP）
  const handleGPSStatus = useCallback((msg: any) => {
    try {
      const statusStr = msg.data || msg;
      const status = typeof statusStr === 'string' ? JSON.parse(statusStr) : statusStr;
      setGpsData(prev => ({
        ...prev,
        quality: status.quality || 0,
        satellites: status.satellites || 0,
        hdop: status.hdop || 99,
        timestamp: Date.now()
      } as GPSData));
    } catch (e) {
      console.error('Failed to parse GPS status:', e);
    }
  }, []);

  // 加载已保存的数据
  const loadSavedData = async () => {
    try {
      const data = await gpsMappingApi.getMappingData();
      if (data) {
        setRoutePoints(data.routePoints || []);
        setBeamPositions(data.beamPositions || []);
        setOriginLatitude(data.origin?.latitude || 0);
        setOriginLongitude(data.origin?.longitude || 0);
        setMapRotation(data.origin?.rotation || 0);
        updateStats(data.routePoints || []);
      }
    } catch (error) {
      console.log('No saved mapping data found');
    }
  };

  // 更新统计
  const updateStats = (points: RoutePoint[]) => {
    const total = points.length;
    const turns = points.filter(p => p.type === 'turn_point').length;
    const beams = points.filter(p => p.type === 'beam_marker').length;
    
    // 计算总距离
    let distance = 0;
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      distance += Math.sqrt(
        Math.pow(p2.mapX - p1.mapX, 2) + Math.pow(p2.mapY - p1.mapY, 2)
      );
    }
    
    setStats({
      totalPoints: total,
      turnPoints: turns,
      beamMarkers: beams,
      distance: distance
    });
  };

  // GPS坐标转地图坐标
  const gpsToMap = (lat: number, lon: number): { x: number; y: number } => {
    // 使用UTM投影（简化版）
    const R = 6371000; // 地球半径（米）
    const latRad = lat * Math.PI / 180;
    const originLatRad = originLatitude * Math.PI / 180;
    
    // 计算相对位置（简化UTM）
    const x = (lon - originLongitude) * R * Math.cos(latRad);
    const y = (lat - originLatitude) * R;
    
    // 应用旋转
    const cos = Math.cos(mapRotation);
    const sin = Math.sin(mapRotation);
    
    return {
      x: x * cos - y * sin,
      y: x * sin + y * cos
    };
  };

  // 开始建图
  const handleStartMapping = async () => {
    if (!gpsData || gpsData.quality < 4) {
      message.warning('请等待GPS达到FIXED状态');
      return;
    }
    
    // 设置原点
    setOriginLatitude(gpsData.latitude);
    setOriginLongitude(gpsData.longitude);
    
    setMappingPhase('recording');
    setRecordingStartTime(Date.now());
    setRoutePoints([]);
    message.success('开始GPS建图');
  };

  // 停止建图
  const handleStopMapping = () => {
    setSaveModalVisible(true);
  };

  // 保存建图数据
  const handleSaveMapping = async () => {
    try {
      const values = await form.validateFields();
      
      const data = {
        name: values.name,
        description: values.description,
        routePoints,
        beamPositions,
        origin: {
          latitude: originLatitude,
          longitude: originLongitude,
          rotation: mapRotation
        },
        createdAt: new Date().toISOString()
      };
      
      await gpsMappingApi.saveMappingData(data);
      message.success('建图数据保存成功');
      setSaveModalVisible(false);
      setMappingPhase('completed');
      form.resetFields();
    } catch (error) {
      message.error('保存失败');
    }
  };

  // 记录路线点
  const recordWaypoint = () => {
    if (!gpsData || mappingPhase !== 'recording') return;
    
    const { x, y } = gpsToMap(gpsData.latitude, gpsData.longitude);
    
    const newPoint: RoutePoint = {
      id: `wp_${Date.now()}`,
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      mapX: x,
      mapY: y,
      type: 'waypoint'
    };
    
    setRoutePoints(prev => [...prev, newPoint]);
    updateStats([...routePoints, newPoint]);
    message.success('已记录路线点');
  };

  // 标记转弯点
  const markTurnPoint = () => {
    if (!gpsData || mappingPhase !== 'recording') return;
    
    const { x, y } = gpsToMap(gpsData.latitude, gpsData.longitude);
    
    const newPoint: RoutePoint = {
      id: `tp_${Date.now()}`,
      latitude: gpsData.latitude,
      longitude: gpsData.longitude,
      mapX: x,
      mapY: y,
      type: 'turn_point',
      description: '转弯点'
    };
    
    setRoutePoints(prev => [...prev, newPoint]);
    updateStats([...routePoints, newPoint]);
    message.success('已标记转弯点');
  };

  // 标记梁位置
  const markBeamPosition = () => {
    if (!gpsData || mappingPhase !== 'recording') return;
    setBeamModalVisible(true);
  };

  // 保存梁位置
  const handleSaveBeam = async () => {
    try {
      const values = await beamForm.validateFields();
      
      const { x, y } = gpsToMap(gpsData!.latitude, gpsData!.longitude);
      
      const newBeam: BeamPosition = {
        id: `beam_${Date.now()}`,
        name: values.name,
        latitude: gpsData!.latitude,
        longitude: gpsData!.longitude,
        mapX: x,
        mapY: y,
        length: values.length || 50,
        width: values.width || 6,
        faces: {}
      };
      
      setBeamPositions(prev => [...prev, newBeam]);
      setBeamModalVisible(false);
      beamForm.resetFields();
      message.success('已标记梁位置');
    } catch (error) {
      // 表单验证失败
    }
  };

  // 清除数据
  const handleClearData = () => {
    setRoutePoints([]);
    setBeamPositions([]);
    setStats({ totalPoints: 0, turnPoints: 0, beamMarkers: 0, distance: 0 });
    message.success('已清除所有数据');
  };

  // 绘制地图
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 设置画布大小
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    
    // 清空画布
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    const gridSize = 50 * scale; // 50米网格
    
    for (let x = offset.x % gridSize; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    for (let y = offset.y % gridSize; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // 绘制原点
    const originScreenX = canvas.width / 2 + offset.x;
    const originScreenY = canvas.height / 2 + offset.y;
    
    ctx.fillStyle = '#1890ff';
    ctx.beginPath();
    ctx.arc(originScreenX, originScreenY, 8, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.fillStyle = '#1890ff';
    ctx.font = '12px sans-serif';
    ctx.fillText('原点', originScreenX + 10, originScreenY);
    
    // 绘制梁位置
    beamPositions.forEach(beam => {
      const screenX = originScreenX + beam.mapX * scale;
      const screenY = originScreenY - beam.mapY * scale;
      
      ctx.fillStyle = 'rgba(24, 144, 255, 0.3)';
      ctx.fillRect(
        screenX - beam.width * scale / 2,
        screenY - beam.length * scale / 2,
        beam.width * scale,
        beam.length * scale
      );
      
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        screenX - beam.width * scale / 2,
        screenY - beam.length * scale / 2,
        beam.width * scale,
        beam.length * scale
      );
      
      ctx.fillStyle = '#1890ff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(beam.name, screenX, screenY);
    });
    
    // 绘制路线
    if (routePoints.length > 1) {
      ctx.strokeStyle = '#52c41a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      
      routePoints.forEach((point, index) => {
        const screenX = originScreenX + point.mapX * scale;
        const screenY = originScreenY - point.mapY * scale;
        
        if (index === 0) {
          ctx.moveTo(screenX, screenY);
        } else {
          ctx.lineTo(screenX, screenY);
        }
      });
      
      ctx.stroke();
    }
    
    // 绘制路线点
    routePoints.forEach(point => {
      const screenX = originScreenX + point.mapX * scale;
      const screenY = originScreenY - point.mapY * scale;
      
      if (point.type === 'turn_point') {
        // 转弯点 - 橙色三角形
        ctx.fillStyle = '#fa8c16';
        ctx.beginPath();
        ctx.moveTo(screenX, screenY - 8);
        ctx.lineTo(screenX - 7, screenY + 5);
        ctx.lineTo(screenX + 7, screenY + 5);
        ctx.closePath();
        ctx.fill();
      } else if (point.type === 'beam_marker') {
        // 梁标记 - 蓝色方块
        ctx.fillStyle = '#1890ff';
        ctx.fillRect(screenX - 5, screenY - 5, 10, 10);
      } else {
        // 普通路线点 - 绿色圆点
        ctx.fillStyle = '#52c41a';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    });
    
    // 绘制当前位置
    if (gpsData && originLatitude !== 0) {
      const { x, y } = gpsToMap(gpsData.latitude, gpsData.longitude);
      const screenX = originScreenX + x * scale;
      const screenY = originScreenY - y * scale;
      
      // 绘制机器人
      ctx.fillStyle = '#ff4d4f';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 10, 0, 2 * Math.PI);
      ctx.fill();
      
      // 绘制方向
      if (gpsData.heading !== undefined) {
        const headingRad = (gpsData.heading - 90) * Math.PI / 180;
        ctx.strokeStyle = '#ff4d4f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(
          screenX + 20 * Math.cos(headingRad),
          screenY + 20 * Math.sin(headingRad)
        );
        ctx.stroke();
      }
    }
    
  }, [routePoints, beamPositions, gpsData, scale, offset, originLatitude, originLongitude, mapRotation]);

  // 缩放操作
  const handleZoomIn = () => setScale(prev => Math.min(prev * 1.2, 10));
  const handleZoomOut = () => setScale(prev => Math.max(prev / 1.2, 0.1));
  const handleResetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  // 鼠标事件
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };
  
  const handleMouseUp = () => setIsDragging(false);
  
  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.1, Math.min(10, prev * delta)));
  };

  // 导出数据
  const handleExport = async () => {
    try {
      const data = {
        routePoints,
        beamPositions,
        origin: {
          latitude: originLatitude,
          longitude: originLongitude,
          rotation: mapRotation
        }
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gps_mapping_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      message.success('导出成功');
    } catch (error) {
      message.error('导出失败');
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={16}>
        {/* 左侧控制面板 */}
        <Col xs={24} lg={6}>
          {/* GPS状态卡片 */}
          <GPSStatusCard
            quality={gpsData?.quality || 0}
            satellites={gpsData?.satellites || 0}
            hdop={gpsData?.hdop || 99}
            latitude={gpsData?.latitude}
            longitude={gpsData?.longitude}
            altitude={gpsData?.altitude}
            heading={gpsData?.heading}
            speed={gpsData?.speed}
            isFixed={gpsData?.quality === 4}
            lastUpdate={gpsData?.timestamp ? new Date(gpsData.timestamp).toLocaleTimeString() : undefined}
          />
          
          {/* 建图控制卡片 */}
          <Card 
            title="建图控制" 
            size="small"
            style={{ marginBottom: 16 }}
          >
            <Space direction="vertical" style={{ width: '100%' }}>
              {mappingPhase === 'idle' ? (
                <Button 
                  type="primary" 
                  block
                  icon={<PlayCircleOutlined />}
                  onClick={handleStartMapping}
                  disabled={!gpsData || gpsData.quality < 4}
                >
                  开始建图
                </Button>
              ) : (
                <>
                  <Button 
                    danger 
                    block
                    icon={<PauseCircleOutlined />}
                    onClick={handleStopMapping}
                  >
                    停止建图
                  </Button>
                  
                  <Divider style={{ margin: '8px 0' }} />
                  
                  <Button 
                    block
                    icon={<EnvironmentOutlined />}
                    onClick={recordWaypoint}
                  >
                    记录路线点
                  </Button>
                  
                  <Button 
                    block
                    icon={<AimOutlined />}
                    onClick={markTurnPoint}
                    style={{ background: '#fa8c16', color: '#fff', borderColor: '#fa8c16' }}
                  >
                    标记转弯点
                  </Button>
                  
                  <Button 
                    block
                    icon={<PlusOutlined />}
                    onClick={markBeamPosition}
                  >
                    标记梁位置
                  </Button>
                </>
              )}
            </Space>
          </Card>
          
          {/* 统计信息 */}
          <Card title="统计信息" size="small" style={{ marginBottom: 16 }}>
            <Row gutter={8}>
              <Col span={12}>
                <Statistic title="路线点" value={stats.totalPoints} />
              </Col>
              <Col span={12}>
                <Statistic title="转弯点" value={stats.turnPoints} />
              </Col>
              <Col span={12}>
                <Statistic title="梁标记" value={stats.beamMarkers} />
              </Col>
              <Col span={12}>
                <Statistic title="距离" value={stats.distance.toFixed(1)} suffix="m" />
              </Col>
            </Row>
          </Card>
          
          {/* 梁位置列表 */}
          <Card 
            title="梁位置列表" 
            size="small"
            extra={
              <Badge count={beamPositions.length} />
            }
          >
            <List
              size="small"
              dataSource={beamPositions}
              renderItem={item => (
                <List.Item
                  actions={[
                    <Button 
                      type="link" 
                      size="small" 
                      danger
                      onClick={() => setBeamPositions(prev => prev.filter(b => b.id !== item.id))}
                    >
                      删除
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    title={item.name}
                    description={`${item.length}m × ${item.width}m`}
                  />
                </List.Item>
              )}
              locale={{ emptyText: '暂无梁位置' }}
            />
          </Card>
        </Col>
        
        {/* 右侧地图区域 */}
        <Col xs={24} lg={18}>
          <Card 
            title="GPS建图视图"
            extra={
              <Space>
                <Tooltip title="放大">
                  <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} />
                </Tooltip>
                <Tooltip title="缩小">
                  <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} />
                </Tooltip>
                <Tooltip title="重置视图">
                  <Button icon={<FullscreenOutlined />} onClick={handleResetView} />
                </Tooltip>
                <Tooltip title="导出数据">
                  <Button icon={<DownloadOutlined />} onClick={handleExport} />
                </Tooltip>
                <Popconfirm
                  title="确定清除所有数据吗？"
                  onConfirm={handleClearData}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    清除
                  </Button>
                </Popconfirm>
              </Space>
            }
          >
            <div 
              style={{ 
                width: '100%', 
                height: 600, 
                border: '1px solid #d9d9d9',
                borderRadius: 4,
                overflow: 'hidden',
                cursor: isDragging ? 'grabbing' : 'grab',
                background: '#f5f5f5',
                position: 'relative'
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              <canvas 
                ref={canvasRef}
                style={{ position: 'absolute', top: 0, left: 0 }}
              />
              
              {!gpsData && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  color: '#999'
                }}>
                  <EnvironmentOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                  <p>等待GPS数据...</p>
                  <p>请确保GPS设备已连接并达到FIXED状态</p>
                </div>
              )}
            </div>
            
            {/* 图例 */}
            <div style={{ marginTop: 16, padding: 16, background: '#fafafa', borderRadius: 4 }}>
              <Space size="large">
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#52c41a', marginRight: 8 }} />路线点</span>
                <span><span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '12px solid #fa8c16', marginRight: 8 }} />转弯点</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#1890ff', marginRight: 8 }} />梁位置</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#ff4d4f', marginRight: 8 }} />当前位置</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#1890ff', marginRight: 8 }} />原点</span>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>
      
      {/* 保存建图数据对话框 */}
      <Modal
        title="保存建图数据"
        open={saveModalVisible}
        onCancel={() => setSaveModalVisible(false)}
        onOk={handleSaveMapping}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="建图名称"
            rules={[{ required: true, message: '请输入建图名称' }]}
          >
            <Input placeholder="例如: 一号梁场GPS地图" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <Input.TextArea rows={3} placeholder="可选描述信息" />
          </Form.Item>
          <Form.Item label="统计信息">
            <Space>
              <Tag>路线点: {stats.totalPoints}</Tag>
              <Tag>转弯点: {stats.turnPoints}</Tag>
              <Tag>梁标记: {stats.beamMarkers}</Tag>
              <Tag>总距离: {stats.distance.toFixed(1)}m</Tag>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
      
      {/* 标记梁位置对话框 */}
      <Modal
        title="标记梁位置"
        open={beamModalVisible}
        onCancel={() => setBeamModalVisible(false)}
        onOk={handleSaveBeam}
      >
        <Form form={beamForm} layout="vertical">
          <Form.Item
            name="name"
            label="梁编号/名称"
            rules={[{ required: true, message: '请输入梁编号' }]}
          >
            <Input placeholder="例如: 梁-A1" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="length"
                label="长度(m)"
                initialValue={50}
              >
                <InputNumber min={1} max={200} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="width"
                label="宽度(m)"
                initialValue={6}
              >
                <InputNumber min={1} max={20} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="当前位置">
            <Space>
              <span>纬度: {gpsData?.latitude.toFixed(7)}°</span>
              <span>经度: {gpsData?.longitude.toFixed(7)}°</span>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GPSMapping;
