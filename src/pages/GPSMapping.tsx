/**
 * GPS建图页面
 * 按照文档 web-gps-mapping-design.md 实现四步骤流程：
 * Step 1: 原点校准
 * Step 2: 道路采集
 * Step 3: 梁位标注
 * Step 4: 生成地图
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Row, Col, Button, Space, message, Modal, Form, Input, InputNumber,
  Table, Tag, Divider, Steps, Select, Tooltip, Popconfirm, List, Badge,
  Statistic, Alert, Descriptions, Result
} from 'antd';
import {
  EnvironmentOutlined, PlayCircleOutlined, PauseCircleOutlined,
  SaveOutlined, ReloadOutlined, DeleteOutlined, PlusOutlined,
  AimOutlined, CarOutlined, BorderOutlined, FileImageOutlined,
  ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined,
  NodeIndexOutlined, LeftOutlined, RollbackOutlined
} from '@ant-design/icons';
import GPSStatusCard from '../components/GPSStatusCard';
import { socketService } from '../services/socket';
import { gpsMappingApi } from '../services/gpsMappingApi';

const { Option } = Select;
const { Text } = { Text: (props: any) => <span {...props} /> };

// 类型定义
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

interface RoadPoint {
  seq: number;
  gps: { latitude: number; longitude: number; altitude: number };
  mapXy: { x: number; y: number };
}

interface Road {
  id: string;
  name: string;
  type: 'longitudinal' | 'horizontal';
  params: {
    preferredWidth: number;
    keepoutDistance: number;
    channelWidth: number;
  };
  points: RoadPoint[];
  pointCount?: number;
  length?: number;
}

// V4.0扩展：交叉点相邻交点
interface IntersectionNeighbors {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  top_road_id?: string;
  bottom_road_id?: string;
  left_road_id?: string;
  right_road_id?: string;
}

// V4.0扩展：交叉点数据
interface Intersection {
  id: string;
  type: string;
  center: {
    gps: { latitude: number; longitude: number; altitude: number };
    mapXy: { x: number; y: number };
  };
  road_v_id?: string;           // 纵向道路ID（V4.0新增）
  road_h_id?: string;           // 横向道路ID（V4.0新增）
  connectedRoads: string[];
  neighbors?: IntersectionNeighbors;  // 四个方向的相邻交点（V4.0新增）
  valid_quadrants?: number[];   // 有效象限列表（V4.0新增）
}

interface TurnPath {
  id: string;
  intersectionId: string;
  fromRoad: string;
  toRoad: string;
  direction: 'left' | 'right' | 'straight' | 'uturn';
  radius: number;
  points: Array<{
    seq: number;
    gps: { latitude: number; longitude: number; altitude: number };
    mapXy: { x: number; y: number };
  }>;
}

// V4.0扩展：转弯圆弧
interface TurnArc {
  id: string;
  intersectionId: string;
  quadrant: number;  // 0-3，四个象限
  radius: number;    // 转弯半径（米）
  center: { x: number; y: number };  // 圆弧中心
  tangentPoints: Array<{ x: number; y: number }>;  // 切点位置
  points: Array<{
    seq: number;
    gps: { latitude: number; longitude: number; altitude: number };
    mapXy: { x: number; y: number };
  }>;
  beam_position_id?: string;  // 关联的梁位ID（V4.0新增）
}

// V3.0新增：直行线路
interface StraightPath {
  id: string;
  intersectionId: string;
  roadId: string;
  points: Array<{
    seq: number;
    gps: { latitude: number; longitude: number; altitude: number };
    mapXy: { x: number; y: number };
  }>;
}

// V4.0扩展：梁位边界道路信息
interface BeamBoundary {
  road_id: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

// V4.0扩展：梁位相邻梁位
interface BeamNeighbors {
  left?: string;
  right?: string;
  top?: string;
  bottom?: string;
}

// V4.0扩展：梁位数据
interface BeamPosition {
  id: string;
  name: string;
  row: string;
  col: number;
  center: { x: number; y: number };
  boundaries: {
    north?: BeamBoundary | string;  // 兼容旧格式
    south?: BeamBoundary | string;
    east?: BeamBoundary | string;
    west?: BeamBoundary | string;
  };
  corner_intersections?: string[];  // V4.0新增
  crossPoints?: string[];           // 兼容旧字段名
  neighbors?: BeamNeighbors;        // V4.0新增
}

interface MappingSession {
  sessionId: string;
  status: 'idle' | 'origin_calibration' | 'road_recording' | 'beam_annotation' | 'generating' | 'completed';
  hasOrigin: boolean;
  roadCount: number;
  intersectionCount: number;
  beamPositionCount: number;
  currentRoadId: string | null;
  lastUpdateTime: number;
}

const GPSMapping: React.FC = () => {
  // GPS状态
  const [gpsData, setGpsData] = useState<GPSData | null>(null);
  const [gpsConnected, setGpsConnected] = useState(false);

  // 建图步骤
  const [currentStep, setCurrentStep] = useState(0);

  // 步骤历史快照 - 用于回退功能
  const [stepSnapshots, setStepSnapshots] = useState<{
    [key: number]: {
      origin: typeof origin extends infer T | undefined ? T : never;
      roads: Road[];
      intersections: Intersection[];
      turnPaths: TurnPath[];
      turnArcs: TurnArc[];
      straightPaths: StraightPath[];
      beamPositions: BeamPosition[];
    };
  }>({});

  // 建图会话
  const [session, setSession] = useState<MappingSession | null>(null);

  // 原点数据
  const [origin, setOrigin] = useState<{
    gps: { latitude: number; longitude: number; altitude: number };
    rotation: number;
  } | null>(null);

  // 道路数据
  const [roads, setRoads] = useState<Road[]>([]);
  const [currentRoad, setCurrentRoad] = useState<Road | null>(null);
  const [isRecordingRoad, setIsRecordingRoad] = useState(false);

  // 交叉点和梁位
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [turnPaths, setTurnPaths] = useState<TurnPath[]>([]);
  const [turnArcs, setTurnArcs] = useState<TurnArc[]>([]);  // V3.0新增
  const [straightPaths, setStraightPaths] = useState<StraightPath[]>([]);  // V3.0新增
  const [beamPositions, setBeamPositions] = useState<BeamPosition[]>([]);

  // 地图视图
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 模态框
  const [newRoadModalVisible, setNewRoadModalVisible] = useState(false);
  const [editBeamModalVisible, setEditBeamModalVisible] = useState(false);
  const [saveMapModalVisible, setSaveMapModalVisible] = useState(false);
  const [editBeamId, setEditBeamId] = useState<string | null>(null);

  // 表单
  const [newRoadForm] = Form.useForm();
  const [editBeamForm] = Form.useForm();
  const [saveMapForm] = Form.useForm();

  // 定时器
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRoadIdRef = useRef<string | null>(null);
  
  // GPS数据ref - 解决setInterval闭包问题
  const gpsDataRef = useRef<GPSData | null>(null);
  
  // GPS 坐标转换节流 - 缓存上次转换结果
  const lastConvertedGpsRef = useRef<{ lat: number; lon: number; x: number; y: number } | null>(null);
  const GPS_THRESHOLD = 0.00001; // 约1米的经纬度变化阈值

  // ==================== 步骤回退功能 ====================

  // 保存当前步骤的状态快照（在进入下一步之前调用）
  const saveStepSnapshot = useCallback((step: number) => {
    setStepSnapshots(prev => ({
      ...prev,
      [step]: {
        origin: origin ? { ...origin } : null,
        roads: roads.map(r => ({ ...r, points: r.points ? [...r.points] : [] })),
        intersections: intersections.map(i => ({ ...i })),
        turnPaths: turnPaths.map(t => ({ ...t, points: t.points ? [...t.points] : [] })),
        turnArcs: turnArcs.map(a => ({ ...a, points: a.points ? [...a.points] : [], tangentPoints: a.tangentPoints ? [...a.tangentPoints] : [] })),
        straightPaths: straightPaths.map(s => ({ ...s, points: s.points ? [...s.points] : [] })),
        beamPositions: beamPositions.map(b => ({ ...b }))
      }
    }));
  }, [origin, roads, intersections, turnPaths, turnArcs, straightPaths, beamPositions]);

  // 回退到上一步
  const goToPrevStep = useCallback(() => {
    if (currentStep <= 0) return;

    const prevStep = currentStep - 1;
    const snapshot = stepSnapshots[prevStep];

    if (snapshot) {
      // 恢复快照状态
      if (snapshot.origin) {
        setOrigin({ ...snapshot.origin });
      }
      setRoads(snapshot.roads.map(r => ({ ...r })));
      setIntersections(snapshot.intersections.map(i => ({ ...i })));
      setTurnPaths(snapshot.turnPaths.map(t => ({ ...t })));
      setTurnArcs(snapshot.turnArcs?.map(a => ({ ...a })) || []);
      setStraightPaths(snapshot.straightPaths?.map(s => ({ ...s })) || []);
      setBeamPositions(snapshot.beamPositions.map(b => ({ ...b })));
    }

    // 切换到上一步
    setCurrentStep(prevStep);
    message.info(`已返回到第 ${prevStep + 1} 步`);
  }, [currentStep, stepSnapshots]);

  // 进入下一步（带快照保存）
  const goToNextStep = useCallback((nextStep: number) => {
    // 保存当前步骤的快照
    saveStepSnapshot(currentStep);
    // 进入下一步
    setCurrentStep(nextStep);
  }, [currentStep, saveStepSnapshot]);

  // ==================== 初始化 ====================

  useEffect(() => {
    initConnection();
    loadSessionStatus();

    return () => {
      cleanup();
    };
  }, []);

  const initConnection = () => {
    socketService.connect();

    // 订阅GPS话题（使用BEST_EFFORT QoS匹配rtk_gps_node发布者）
    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/gps/fix',
      type: 'sensor_msgs/NavSatFix',
      options: {
        qos: {
          reliability: { type: 'best_effort' }
        }
      }
    });

    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/gps/quality',
      type: 'std_msgs/Int8',
      options: {
        qos: {
          reliability: { type: 'best_effort' }
        }
      }
    });

    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/gps/status',
      type: 'std_msgs/String'
    });

    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/gps/heading',
      type: 'std_msgs/Float64',
      options: {
        qos: {
          reliability: { type: 'best_effort' }
        }
      }
    });

    socketService.on('ros_message', handleGPSMessage);
  };

  const cleanup = () => {
    socketService.off('ros_message');
    socketService.sendRosCommand({ op: 'unsubscribe', topic: '/gps/fix' });
    socketService.sendRosCommand({ op: 'unsubscribe', topic: '/gps/quality' });
    socketService.sendRosCommand({ op: 'unsubscribe', topic: '/gps/status' });
    socketService.sendRosCommand({ op: 'unsubscribe', topic: '/gps/heading' });

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }
  };

  // 处理GPS消息
  const handleGPSMessage = useCallback((data: any) => {
    if (data.topic === '/gps/fix') {
      // 确保GPS数据是数字类型（ROS2可能传递字符串）
      const latitude = parseFloat(data.msg.latitude);
      const longitude = parseFloat(data.msg.longitude);
      const altitude = parseFloat(data.msg.altitude) || 0;
      
      // 调试：每10次打印一次GPS数据
      if (!window._gpsDebugCount) window._gpsDebugCount = 0;
      window._gpsDebugCount++;
      if (window._gpsDebugCount % 10 === 1) {
        console.log('[GPS] 收到GPS数据:', latitude?.toFixed(7), longitude?.toFixed(7));
      }
      const newGpsData = {
        ...gpsDataRef.current,
        latitude,
        longitude,
        altitude,
        timestamp: Date.now()
      } as GPSData;
      gpsDataRef.current = newGpsData;  // 更新ref
      setGpsData(newGpsData);
      setGpsConnected(true);
    } else if (data.topic === '/gps/quality') {
      const quality = parseInt(data.msg.data || data.msg.quality) || 0;
      const newGpsData = {
        ...gpsDataRef.current,
        quality,
        satellites: parseInt(data.msg.satellites) || gpsDataRef.current?.satellites || 0,
        hdop: parseFloat(data.msg.hdop) || gpsDataRef.current?.hdop || 0,
        heading: parseFloat(data.msg.heading) || gpsDataRef.current?.heading || 0,
        speed: parseFloat(data.msg.speed) || gpsDataRef.current?.speed || 0
      } as GPSData;
      gpsDataRef.current = newGpsData;  // 更新ref
      setGpsData(newGpsData);
    } else if (data.topic === '/gps/status') {
      try {
        const statusStr = data.msg.data || data.msg;
        const status = typeof statusStr === 'string' ? JSON.parse(statusStr) : statusStr;
        const newGpsData = {
          ...gpsDataRef.current,
          quality: parseInt(status.quality) || 0,
          satellites: parseInt(status.satellites) || 0,
          hdop: parseFloat(status.hdop) || 99,
          timestamp: Date.now()
        } as GPSData;
        gpsDataRef.current = newGpsData;  // 更新ref
        setGpsData(newGpsData);
      } catch (e) {
        console.error('Failed to parse GPS status:', e);
      }
    }
  }, []);

  // 加载会话状态
  const loadSessionStatus = async () => {
    try {
      const response = await gpsMappingApi.getMappingStatus();
      if (response.success && response.data) {
        setSession(response.data);

        // V3.0新增：加载turnArcs和straightPaths数据
        if (response.data.turnArcs) {
          setTurnArcs(response.data.turnArcs);
        }
        if (response.data.straightPaths) {
          setStraightPaths(response.data.straightPaths);
        }

        if (response.data.status === 'completed') {
          setCurrentStep(4);
        } else if (response.data.beamPositionCount > 0) {
          setCurrentStep(3);
        } else if (response.data.intersectionCount > 0) {
          setCurrentStep(2);
        } else if (response.data.roadCount > 0 || response.data.hasOrigin) {
          setCurrentStep(1);
        } else {
          setCurrentStep(0);
        }

        if (response.data.hasOrigin) {
          await loadOrigin();
        }
        if (response.data.roadCount > 0) {
          await loadRoads();
        }
      }
    } catch (error) {
      console.log('No active mapping session');
    }
  };

  const loadOrigin = async () => {
    try {
      const response = await gpsMappingApi.getOrigin();
      if (response.success && response.data) {
        setOrigin({
          gps: {
            latitude: response.data.gps.latitude,
            longitude: response.data.gps.longitude,
            altitude: response.data.gps.altitude
          },
          rotation: response.data.rotation || 0
        });
      }
    } catch (error) {
      console.error('Failed to load origin:', error);
    }
  };

  const loadRoads = async () => {
    try {
      const response = await gpsMappingApi.getRoads();
      if (response.success && response.data) {
        setRoads(response.data);
      }
    } catch (error) {
      console.error('Failed to load roads:', error);
    }
  };

  // ==================== Step 1: 原点校准 ====================

  const completeOriginCalibration = async () => {
    if (!gpsData) {
      message.warning('等待GPS数据');
      return;
    }

    if (gpsData.quality < 4) {
      message.warning('GPS状态需要达到FIXED才能校准原点');
      return;
    }

    try {
      const response = await gpsMappingApi.completeOriginCalibration({
        latitude: gpsData.latitude,
        longitude: gpsData.longitude,
        altitude: gpsData.altitude,
        rotation: 0
      });

      if (response.success) {
        message.success('原点校准完成！补给站位置已设置');
        setOrigin({
          gps: {
            latitude: gpsData.latitude,
            longitude: gpsData.longitude,
            altitude: gpsData.altitude
          },
          rotation: 0
        });
        setCurrentStep(1);
        await loadSessionStatus();
      }
    } catch (error) {
      message.error('完成原点校准失败');
    }
  };

  // ==================== Step 2: 道路采集 ====================

  const showNewRoadModal = () => {
    newRoadForm.resetFields();
    newRoadForm.setFieldsValue({
      type: 'longitudinal',
      name: '',
      preferredWidth: 2.0,
      keepoutDistance: 2.5,
      channelWidth: 6.0
    });
    setNewRoadModalVisible(true);
  };

  const startRoadRecording = async () => {
    try {
      const values = await newRoadForm.validateFields();

      const response = await gpsMappingApi.startRoadRecording({
        name: values.name,
        type: values.type,
        params: {
          preferredWidth: values.preferredWidth,
          keepoutDistance: values.keepoutDistance,
          channelWidth: values.channelWidth
        }
      });

      if (response.success && response.data) {
        setCurrentRoad(response.data.road);
        currentRoadIdRef.current = response.data.roadId;
        setIsRecordingRoad(true);
        setNewRoadModalVisible(false);
        message.success(`开始采集${values.type === 'longitudinal' ? '纵向' : '横向'}通道`);

        // 启动定时上报GPS点
        recordingIntervalRef.current = setInterval(() => {
          // 使用 ref 获取最新 GPS 数据（解决闭包问题）
          const currentGpsData = gpsDataRef.current;
          if (currentGpsData && currentGpsData.quality >= 4 && currentRoadIdRef.current) {
            recordCurrentGPSPoint(currentRoadIdRef.current, currentGpsData);
          }
        }, 1000);
      }
    } catch (error) {
      message.error('开始道路采集失败');
    }
  };

  const recordCurrentGPSPoint = async (roadId: string, gpsPoint: GPSData | null) => {
    if (!gpsPoint) {
      return;
    }

    // 验证GPS数据有效性
    if (isNaN(gpsPoint.latitude) || isNaN(gpsPoint.longitude)) {
      console.warn('[GPS建图] GPS坐标无效，跳过记录');
      return;
    }

    // 调试：打印实际发送的GPS数据
    if (!window._gpsRecordCount) window._gpsRecordCount = 0;
    window._gpsRecordCount++;
    if (window._gpsRecordCount % 10 === 1) {
      console.log(`[GPS建图] 发送道路点 #${window._gpsRecordCount}:`, 
        gpsPoint.latitude?.toFixed(7), gpsPoint.longitude?.toFixed(7));
    }

    try {
      await gpsMappingApi.recordRoadPoint(roadId, {
        latitude: gpsPoint.latitude,
        longitude: gpsPoint.longitude,
        altitude: gpsPoint.altitude || 0
      });

      // 更新当前道路的点数
      setCurrentRoad(prev => prev ? { ...prev, pointCount: (prev.pointCount || 0) + 1 } : null);
    } catch (error: any) {
      // 静默处理400错误（无效GPS坐标）
      if (error?.response?.status !== 400) {
        console.error('记录道路点失败:', error);
      }
    }
  };

  const endRoadRecording = async () => {
    try {
      // 先停止定时器
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      const response = await gpsMappingApi.endRoadRecording();
      if (response.success) {
        message.success('道路采集完成');
      } else {
        message.warning(response.message || '道路点数不足');
      }
    } catch (error: any) {
      // 即使后端报错，也清理前端状态
      const errorMsg = error?.response?.data?.message || '结束道路采集失败';
      if (errorMsg.includes('没有正在采集')) {
        // 后端已经没有正在采集的道路，静默处理
        console.log('道路采集已结束');
      } else {
        message.warning(errorMsg);
      }
    } finally {
      // 无论成功还是失败，都清理前端状态
      setIsRecordingRoad(false);
      setCurrentRoad(null);
      currentRoadIdRef.current = null;
      await loadRoads();
      await loadSessionStatus();
    }
  };

  const deleteRoad = async (roadId: string) => {
    try {
      const response = await gpsMappingApi.deleteRoad(roadId);
      if (response.success) {
        message.success('道路已删除');
        await loadRoads();
        await loadSessionStatus();
      }
    } catch (error) {
      message.error('删除道路失败');
    }
  };

  // ==================== Step 3: 梁位标注 ====================

  const generateIntersections = async () => {
    try {
      message.loading({ content: '正在识别交叉点和转弯路线...', key: 'intersection' });
      const response = await gpsMappingApi.generateIntersections();
      if (response.success) {
        // 处理返回的数据（包含交叉点和转弯路线）
        const data = response.data;
        if (data.intersections) {
          setIntersections(data.intersections);
        } else if (Array.isArray(data)) {
          setIntersections(data);
        }
        if (data.turnPaths) {
          setTurnPaths(data.turnPaths);
        }
        message.success({ 
          content: response.message || `已识别 ${data.intersections?.length || data.length || 0} 个交叉点`, 
          key: 'intersection' 
        });
        await loadSessionStatus();
      }
    } catch (error: any) {
      message.error({ content: error.response?.data?.message || '生成交叉点失败', key: 'intersection' });
    }
  };

  const generateBeamPositions = async () => {
    try {
      message.loading({ content: '正在识别梁位...', key: 'beam' });
      const response = await gpsMappingApi.generateBeamPositions();
      if (response.success) {
        message.success({ content: response.message || `已识别 ${response.data?.length || 0} 个梁位`, key: 'beam' });
        setBeamPositions(response.data || []);
        setCurrentStep(3);
        await loadSessionStatus();
      }
    } catch (error: any) {
      message.error({ content: error.response?.data?.message || '生成梁位失败', key: 'beam' });
    }
  };

  const showEditBeamModal = (beam: BeamPosition) => {
    setEditBeamId(beam.id);
    editBeamForm.setFieldsValue({
      name: beam.name,
      row: beam.row,
      col: beam.col
    });
    setEditBeamModalVisible(true);
  };

  const updateBeamPosition = async () => {
    try {
      const values = await editBeamForm.validateFields();
      const response = await gpsMappingApi.updateBeamPosition(editBeamId!, values);
      if (response.success) {
        message.success('梁位已更新');
        setEditBeamModalVisible(false);
        setBeamPositions(prev => prev.map(b =>
          b.id === editBeamId ? { ...b, ...values } : b
        ));
      }
    } catch (error) {
      message.error('更新梁位失败');
    }
  };

  const deleteBeamPosition = async (beamId: string) => {
    try {
      const response = await gpsMappingApi.deleteBeamPosition(beamId);
      if (response.success) {
        message.success('梁位已删除');
        setBeamPositions(prev => prev.filter(b => b.id !== beamId));
      }
    } catch (error) {
      message.error('删除梁位失败');
    }
  };

  // ==================== Step 4: 生成地图 ====================

  const generateMapFiles = async () => {
    try {
      message.loading({ content: '正在生成地图文件...', key: 'generate', duration: 0 });
      const response = await gpsMappingApi.generateMapFiles();
      if (response.success) {
        message.success({ content: '地图文件生成完成！', key: 'generate' });
        setCurrentStep(4);
        await loadSessionStatus();
      }
    } catch (error) {
      message.error({ content: '生成地图文件失败', key: 'generate' });
    }
  };

  const saveMapToDatabase = async () => {
    try {
      const values = await saveMapForm.validateFields();
      const response = await gpsMappingApi.saveMappingToDatabase(values);
      if (response.success) {
        message.success('地图已保存到数据库');
        setSaveMapModalVisible(false);
      }
    } catch (error) {
      message.error('保存地图失败');
    }
  };

  const resetMapping = async () => {
    Modal.confirm({
      title: '确认重置',
      content: '重置将清除所有当前建图数据，是否继续？',
      onOk: async () => {
        try {
          const response = await gpsMappingApi.resetMapping();
          if (response.success) {
            message.success('已重置建图会话');
            setOrigin(null);
            setRoads([]);
            setCurrentRoad(null);
            setIsRecordingRoad(false);
            setIntersections([]);
            setBeamPositions([]);
            setTurnPaths([]);
            setTurnArcs([]);  // V3.0新增
            setStraightPaths([]);  // V3.0新增
            setStepSnapshots({}); // 清除快照
            setCurrentStep(0);
            await loadSessionStatus();
          }
        } catch (error) {
          message.error('重置失败');
        }
      }
    });
  };

  // ==================== 地图绘制 ====================

  useEffect(() => {
    drawMap();
  }, [roads, beamPositions, gpsData, scale, offset, origin]);

  const drawMap = () => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

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
    const gridSize = 50 * scale;

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

    const originScreenX = canvas.width / 2 + offset.x;
    const originScreenY = canvas.height / 2 + offset.y;

    // 绘制原点（补给站）
    if (origin) {
      ctx.fillStyle = '#1890ff';
      ctx.beginPath();
      ctx.arc(originScreenX, originScreenY, 10, 0, 2 * Math.PI);
      ctx.fill();

      ctx.fillStyle = '#1890ff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('补给站', originScreenX, originScreenY - 20);
    }

    // 绘制道路
    roads.forEach(road => {
      const points = road.points || [];
      if (points.length < 2) return;

      const screenPoints = points.map((pt: RoadPoint) => ({
        x: originScreenX + pt.mapXy.x * scale,
        y: originScreenY - pt.mapXy.y * scale
      }));

      // 绘制首选路网（绿色）
      ctx.strokeStyle = '#52c41a';
      ctx.lineWidth = road.params.preferredWidth * scale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      screenPoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();

      // 绘制道路中心线
      ctx.strokeStyle = road.type === 'longitudinal' ? '#1890ff' : '#fa8c16';
      ctx.lineWidth = 2;
      ctx.beginPath();
      screenPoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.stroke();
    });

    // 绘制交叉点
    intersections.forEach(intersection => {
      const screenX = originScreenX + intersection.center.mapXy.x * scale;
      const screenY = originScreenY - intersection.center.mapXy.y * scale;

      ctx.fillStyle = '#722ed1';
      ctx.beginPath();
      ctx.arc(screenX, screenY, 6, 0, 2 * Math.PI);
      ctx.fill();
    });

    // 绘制转弯路线
    turnPaths.forEach(turnPath => {
      if (!turnPath.points || turnPath.points.length < 2) return;

      // 根据转弯方向选择颜色
      let color = '#13c2c2'; // 默认青色
      switch (turnPath.direction) {
        case 'left':
          color = '#52c41a'; // 绿色
          break;
        case 'right':
          color = '#1890ff'; // 蓝色
          break;
        case 'uturn':
          color = '#fa8c16'; // 橙色
          break;
        case 'straight':
          color = '#8c8c8c'; // 灰色
          break;
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]); // 虚线
      ctx.beginPath();
      turnPath.points.forEach((pt, i) => {
        const screenX = originScreenX + pt.mapXy.x * scale;
        const screenY = originScreenY - pt.mapXy.y * scale;
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      });
      ctx.stroke();
      ctx.setLineDash([]); // 重置为实线
    });

    // 绘制转弯圆弧（V3.0新增）- 四分之一圆弧
    turnArcs.forEach(arc => {
      if (!arc.points || arc.points.length < 2) return;

      // 绘制圆弧路径
      ctx.strokeStyle = '#ff6b6b'; // 红色
      ctx.lineWidth = 3;
      ctx.beginPath();
      arc.points.forEach((pt, i) => {
        const screenX = originScreenX + pt.mapXy.x * scale;
        const screenY = originScreenY - pt.mapXy.y * scale;
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      });
      ctx.stroke();

      // 绘制圆弧中心点（小圆圈）
      const centerScreenX = originScreenX + arc.center.x * scale;
      const centerScreenY = originScreenY - arc.center.y * scale;
      ctx.strokeStyle = '#ff6b6b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerScreenX, centerScreenY, 3, 0, 2 * Math.PI);
      ctx.stroke();
    });

    // 绘制直行线路（V3.0新增）
    straightPaths.forEach(sp => {
      if (!sp.points || sp.points.length < 2) return;

      ctx.strokeStyle = '#722ed1'; // 紫色
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 2]); // 虚线
      ctx.beginPath();
      sp.points.forEach((pt, i) => {
        const screenX = originScreenX + pt.mapXy.x * scale;
        const screenY = originScreenY - pt.mapXy.y * scale;
        if (i === 0) ctx.moveTo(screenX, screenY);
        else ctx.lineTo(screenX, screenY);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 绘制梁位
    beamPositions.forEach(beam => {
      const screenX = originScreenX + beam.center.x * scale;
      const screenY = originScreenY - beam.center.y * scale;

      const width = 25 * scale;
      const height = 50 * scale;

      ctx.fillStyle = 'rgba(24, 144, 255, 0.2)';
      ctx.fillRect(screenX - width / 2, screenY - height / 2, width, height);

      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(screenX - width / 2, screenY - height / 2, width, height);

      ctx.fillStyle = '#1890ff';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(beam.name, screenX, screenY + 5);
    });

    // 绘制当前位置（带节流）
    if (gpsData && origin) {
      const lat = gpsData.latitude;
      const lon = gpsData.longitude;
      
      // 检查是否需要重新转换（节流逻辑）
      const needConvert = !lastConvertedGpsRef.current || 
        Math.abs(lat - lastConvertedGpsRef.current.lat) > GPS_THRESHOLD ||
        Math.abs(lon - lastConvertedGpsRef.current.lon) > GPS_THRESHOLD;
      
      const drawCurrentPosition = (mapX: number, mapY: number) => {
        const screenX = originScreenX + mapX * scale;
        const screenY = originScreenY - mapY * scale;

        ctx.fillStyle = '#ff4d4f';
        ctx.beginPath();
        ctx.arc(screenX, screenY, 12, 0, 2 * Math.PI);
        ctx.fill();

        if (gpsData.heading !== undefined) {
          const headingRad = (gpsData.heading - 90) * Math.PI / 180;
          ctx.strokeStyle = '#ff4d4f';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(
            screenX + 25 * Math.cos(headingRad),
            screenY + 25 * Math.sin(headingRad)
          );
          ctx.stroke();
        }
      };
      
      if (needConvert) {
        // 需要转换时才调用 API
        gpsMappingApi.convertGPSToMap(lat, lon).then(response => {
          if (response.success && response.data) {
            // 缓存转换结果
            lastConvertedGpsRef.current = { lat, lon, x: response.data.x, y: response.data.y };
            drawCurrentPosition(response.data.x, response.data.y);
          }
        });
      } else if (lastConvertedGpsRef.current) {
        // 使用缓存的结果绘制
        drawCurrentPosition(lastConvertedGpsRef.current.x, lastConvertedGpsRef.current.y);
      }
    }
  };

  // ==================== 事件处理 ====================

  const handleZoomIn = () => setScale(prev => Math.min(prev * 1.2, 10));
  const handleZoomOut = () => setScale(prev => Math.max(prev / 1.2, 0.1));
  const handleResetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

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

  // ==================== 渲染 ====================

  const steps = [
    { title: '原点校准', icon: <AimOutlined /> },
    { title: '道路采集', icon: <CarOutlined /> },
    { title: '梁位标注', icon: <BorderOutlined /> },
    { title: '生成地图', icon: <FileImageOutlined /> }
  ];

  return (
    <div style={{ padding: 24 }}>
      {/* 步骤指示器 */}
      <Card style={{ marginBottom: 16 }}>
        <Steps current={currentStep} items={steps.map(s => ({ title: s.title, icon: s.icon }))} />
        {/* 回退按钮区域 */}
        {currentStep > 0 && (
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Space>
              {currentStep > 1 && (
                <Button 
                  icon={<LeftOutlined />} 
                  onClick={goToPrevStep}
                >
                  返回第{currentStep}步: {steps[currentStep - 1]?.title}
                </Button>
              )}
              {currentStep === 1 && (
                <Button 
                  icon={<RollbackOutlined />} 
                  onClick={goToPrevStep}
                >
                  返回原点校准
                </Button>
              )}
            </Space>
          </div>
        )}
      </Card>

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

          {/* Step 0: 原点校准 */}
          {currentStep === 0 && (
            <Card title="原点校准" size="small" style={{ marginBottom: 16 }}>
              <Alert
                message="请将车辆停放在补给站位置"
                description="GPS状态需要达到FIXED才能完成校准"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
              {origin ? (
                <>
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="纬度">{origin.gps.latitude.toFixed(7)}°</Descriptions.Item>
                    <Descriptions.Item label="经度">{origin.gps.longitude.toFixed(7)}°</Descriptions.Item>
                    <Descriptions.Item label="状态">
                      <Tag color="success">已校准</Tag>
                    </Descriptions.Item>
                  </Descriptions>
                  <Button type="primary" block onClick={() => goToNextStep(1)}>
                    下一步：开始道路采集
                  </Button>
                </>
              ) : (
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Button
                    type="primary"
                    block
                    icon={<AimOutlined />}
                    onClick={completeOriginCalibration}
                    disabled={!gpsData || gpsData.quality < 4}
                  >
                    确认原点（当前GPS位置）
                  </Button>
                  <Text type="secondary">
                    GPS状态: {gpsData?.quality === 4 ? 'FIXED ✓' : '等待FIXED...'}
                  </Text>
                </Space>
              )}
            </Card>
          )}

          {/* Step 1: 道路采集 */}
          {currentStep === 1 && (
            <Card
              title={`道路采集 (${roads.length}条)`}
              size="small"
              style={{ marginBottom: 16 }}
              extra={
                <Space>
                  <Button size="small" onClick={goToPrevStep}>
                    上一步
                  </Button>
                  <Button 
                    size="small" 
                    type="primary" 
                    onClick={() => { saveStepSnapshot(1); generateIntersections(); setCurrentStep(2); }} 
                    disabled={roads.length < 2}
                  >
                    下一步
                  </Button>
                </Space>
              }
            >
              {isRecordingRoad ? (
                <>
                  <Alert
                    message={`正在采集: ${currentRoad?.name}`}
                    description="请驾驶车辆沿通道行驶，系统将自动记录GPS轨迹"
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                  />
                  <Statistic title="已记录点数" value={currentRoad?.pointCount || 0} />
                  <Button
                    type="primary"
                    danger
                    block
                    icon={<PauseCircleOutlined />}
                    onClick={endRoadRecording}
                    style={{ marginTop: 16 }}
                  >
                    结束当前道路
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="primary"
                    block
                    icon={<PlusOutlined />}
                    onClick={showNewRoadModal}
                    disabled={!origin}
                  >
                    开始新道路
                  </Button>

                  <List
                    size="small"
                    dataSource={roads}
                    style={{ marginTop: 16 }}
                    renderItem={road => (
                      <List.Item
                        actions={[
                          <Button type="link" size="small" danger onClick={() => deleteRoad(road.id)}>
                            删除
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={
                            <Space>
                              <Tag color={road.type === 'longitudinal' ? 'blue' : 'orange'}>
                                {road.type === 'longitudinal' ? '纵向' : '横向'}
                              </Tag>
                              {road.name}
                            </Space>
                          }
                          description={`${road.pointCount || road.points?.length || 0}点 · ${(road.length || 0).toFixed(0)}m`}
                        />
                      </List.Item>
                    )}
                    locale={{ emptyText: '暂无道路，点击上方按钮开始采集' }}
                  />
                </>
              )}
            </Card>
          )}

          {/* Step 2: 梁位标注 */}
          {currentStep === 2 && (
            <Card
              title="梁位标注"
              size="small"
              style={{ marginBottom: 16 }}
              extra={
                <Space>
                  <Button size="small" onClick={goToPrevStep}>
                    上一步
                  </Button>
                  <Button 
                    size="small" 
                    type="primary" 
                    onClick={() => goToNextStep(3)} 
                    disabled={beamPositions.length === 0}
                  >
                    下一步
                  </Button>
                </Space>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  block
                  icon={<NodeIndexOutlined />}
                  onClick={generateIntersections}
                  disabled={roads.length < 2}
                >
                  自动识别交叉点
                </Button>

                {intersections.length > 0 && (
                  <>
                    <Text>已识别 {intersections.length} 个交叉点</Text>
                    <Button
                      type="primary"
                      block
                      icon={<BorderOutlined />}
                      onClick={generateBeamPositions}
                    >
                      自动识别梁位
                    </Button>
                  </>
                )}

                {beamPositions.length > 0 && (
                  <List
                    size="small"
                    dataSource={beamPositions}
                    style={{ marginTop: 16, maxHeight: 200, overflow: 'auto' }}
                    renderItem={beam => (
                      <List.Item
                        actions={[
                          <Button type="link" size="small" onClick={() => showEditBeamModal(beam)}>
                            编辑
                          </Button>,
                          <Button type="link" size="small" danger onClick={() => deleteBeamPosition(beam.id)}>
                            删除
                          </Button>
                        ]}
                      >
                        <List.Item.Meta
                          title={<Tag color="blue">{beam.name}</Tag>}
                          description={`行${beam.row} 列${beam.col}`}
                        />
                      </List.Item>
                    )}
                  />
                )}
              </Space>
            </Card>
          )}

          {/* Step 3: 生成地图 */}
          {currentStep === 3 && (
            <Card 
              title="生成地图" 
              size="small" 
              style={{ marginBottom: 16 }}
              extra={
                <Button size="small" onClick={goToPrevStep}>
                  上一步
                </Button>
              }
            >
              <Space direction="vertical" style={{ width: '100%' }}>
                <Alert
                  message="准备就绪"
                  description={`共${roads.length}条道路、${intersections.length}个交叉点、${beamPositions.length}个梁位`}
                  type="success"
                  showIcon
                  style={{ marginBottom: 16 }}
                />
                <Button
                  type="primary"
                  block
                  icon={<FileImageOutlined />}
                  onClick={generateMapFiles}
                >
                  生成地图文件
                </Button>
                <Button
                  block
                  icon={<SaveOutlined />}
                  onClick={() => setSaveMapModalVisible(true)}
                >
                  保存到数据库
                </Button>
              </Space>
            </Card>
          )}

          {/* Step 4: 完成 */}
          {currentStep === 4 && (
            <Card title="建图完成" size="small" style={{ marginBottom: 16 }}>
              <Result
                status="success"
                title="地图生成成功！"
                subTitle="地图文件已保存到 maps/beam_field/ 目录"
                extra={[
                  <Button key="back" onClick={goToPrevStep}>
                    返回修改
                  </Button>,
                  <Button type="primary" key="new" onClick={resetMapping}>
                    新建地图
                  </Button>
                ]}
              />
            </Card>
          )}

          {/* 统计信息 */}
          <Card title="统计信息" size="small">
            <Row gutter={[8, 8]}>
              <Col span={12}>
                <Statistic title="道路数" value={roads.length} />
              </Col>
              <Col span={12}>
                <Statistic title="交叉点" value={intersections.length} />
              </Col>
              <Col span={12}>
                <Statistic title="转弯圆弧" value={turnArcs.length} />
              </Col>
              <Col span={12}>
                <Statistic title="直行线路" value={straightPaths.length} />
              </Col>
              <Col span={12}>
                <Statistic title="梁位数" value={beamPositions.length} />
              </Col>
              <Col span={12}>
                <Statistic title="原点" value={origin ? '已校准' : '未校准'} />
              </Col>
            </Row>
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
                <Popconfirm
                  title="确定重置建图会话吗？"
                  onConfirm={resetMapping}
                >
                  <Button danger icon={<ReloadOutlined />}>
                    重置
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

              {!origin && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  color: '#999'
                }}>
                  <AimOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                  <p>请先完成原点校准</p>
                </div>
              )}
            </div>

            {/* 图例 */}
            <div style={{ marginTop: 16, padding: 16, background: '#fafafa', borderRadius: 4 }}>
              <Space size="large" wrap>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#1890ff', marginRight: 8 }} />补给站</span>
                <span><span style={{ display: 'inline-block', width: 20, height: 4, background: '#52c41a', marginRight: 8 }} />首选路网</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#722ed1', marginRight: 8 }} />交叉点</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, background: 'rgba(24, 144, 255, 0.3)', border: '1px solid #1890ff', marginRight: 8 }} />梁位</span>
                <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: '#ff4d4f', marginRight: 8 }} />当前位置</span>
                <span><span style={{ display: 'inline-block', width: 20, height: 2, background: '#eb2f96', marginRight: 8 }} />转弯圆弧</span>
                <span><span style={{ display: 'inline-block', width: 20, height: 2, background: '#722ed1', marginRight: 8 }} />直行线路</span>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 新建道路对话框 */}
      <Modal
        title="开始新道路"
        open={newRoadModalVisible}
        onCancel={() => setNewRoadModalVisible(false)}
        onOk={startRoadRecording}
      >
        <Form form={newRoadForm} layout="vertical">
          <Form.Item name="type" label="道路类型" rules={[{ required: true }]}>
            <Select>
              <Option value="longitudinal">纵向通道（南北向）</Option>
              <Option value="horizontal">横向通道（东西向）</Option>
            </Select>
          </Form.Item>
          <Form.Item name="name" label="道路名称">
            <Input placeholder="例如：纵向通道A" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="preferredWidth" label="首选宽度(m)">
                <InputNumber min={1} max={4} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="keepoutDistance" label="禁区宽度(m)">
                <InputNumber min={1} max={5} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="channelWidth" label="通道宽度(m)">
                <InputNumber min={4} max={10} step={0.5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Alert
            message="提示"
            description="点击确定后，请驾驶车辆沿通道行驶，系统将自动记录GPS轨迹"
            type="info"
            showIcon
          />
        </Form>
      </Modal>

      {/* 编辑梁位对话框 */}
      <Modal
        title="编辑梁位编号"
        open={editBeamModalVisible}
        onCancel={() => setEditBeamModalVisible(false)}
        onOk={updateBeamPosition}
      >
        <Form form={editBeamForm} layout="vertical">
          <Form.Item name="name" label="梁位编号" rules={[{ required: true }]}>
            <Input placeholder="例如：A1" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="row" label="行标签">
                <Input placeholder="A, B, C..." />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="col" label="列号">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 保存地图对话框 */}
      <Modal
        title="保存地图"
        open={saveMapModalVisible}
        onCancel={() => setSaveMapModalVisible(false)}
        onOk={saveMapToDatabase}
      >
        <Form form={saveMapForm} layout="vertical">
          <Form.Item name="name" label="地图名称" rules={[{ required: true }]}>
            <Input placeholder="例如：一号梁场GPS地图" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} placeholder="可选描述信息" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GPSMapping;
