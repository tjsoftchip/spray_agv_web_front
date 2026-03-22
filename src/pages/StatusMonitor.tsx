import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Row, Col, Progress, Tag, Button, Space, Switch, Badge, Tooltip, notification } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseOutlined, 
  StopOutlined,
  EyeOutlined,
  CompassOutlined,
  GlobalOutlined,
  WarningOutlined,
  CloseCircleOutlined
} from '@ant-design/icons';
import MapViewer from '../components/MapViewer';
import { socketService } from '../services/socket';
import { navigationApi, obstacleApi } from '../services/navigationApi';
import { systemApi } from '../services/systemApi';
import type { ObstacleStatus } from '../services/navigationApi';

interface NavigationStatus {
  status: string;
  taskId: string;
  progress: number;
  currentIndex: number;
  totalPoints: number;
  currentPoint?: {
    pointName: string;
    position: { x: number; y: number };
    status: string;
  };
}

const StatusMonitor: React.FC = () => {
  // 机器人位置（初始为世界坐标原点，等待从 ROS2 获取实际位置）
  const [robotPosition, setRobotPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [waterLevel, setWaterLevel] = useState<number | null>(null);
  const [linearVelocity, setLinearVelocity] = useState(0); // 线速度 m/s
  const [angularVelocity, setAngularVelocity] = useState(0); // 角速度 rad/s
  const [dataLoading, setDataLoading] = useState(true); // 数据加载状态

  // 地图加载完成回调
  const handleMapLoaded = (mapInfo: { origin: { x: number; y: number; z: number }; resolution: number; width: number; height: number }) => {
    // 地图加载完成，机器人位置将从 ROS2 实时数据中获取
  };
  const [speed, setSpeed] = useState(0);
  const [taskStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [navigationStatus, setNavigationStatus] = useState<NavigationStatus | null>(null);
  const [obstacleStatus, setObstacleStatus] = useState<ObstacleStatus | null>(null);
  const [cameraImage, setCameraImage] = useState<string | null>(null);
  const [enableCameraPreview, setEnableCameraPreview] = useState(false);
  const [useWebVideoServer, setUseWebVideoServer] = useState(true); // 使用 web_video_server
  const [controlLoading, setControlLoading] = useState(false);
  const [mapCenter] = useState<[number, number]>([0, 0]);
  
  // 传感器在线状态
  const [lidarOnline, setLidarOnline] = useState(false);
  const [cameraOnline, setCameraOnline] = useState(false);
  
  // 性能优化：节流refs
  const lastVelUpdateRef = useRef<number>(0);
  const lastPoseUpdateRef = useRef<number>(0);
  const lastGpsUpdateRef = useRef<number>(0);
  const THROTTLE_MS = 100; // 状态更新节流间隔
  
  // GPS 状态
  const [gpsStatus, setGpsStatus] = useState<{
    quality: number;
    satellites: number;
    hdop: number;
    latitude: number;
    longitude: number;
    altitude: number;
    isFixed: boolean;
  } | null>(null);
  
  // 报警状态 - 来自 alarm_manager_node 的完整报警信息
  interface AlarmItem {
    alarm_id: string;
    alarm_type: string;
    priority: number;  // 1=LOW, 2=MEDIUM, 3=HIGH, 4=CRITICAL
    message: string;
    source: string;
    timestamp: number;
    acknowledged: boolean;
    count: number;
    details: Record<string, any>;
  }
  
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [alarmCount, setAlarmCount] = useState(0);
  
  // 报警通知（用于弹窗提醒）
  const [alarmNotify, setAlarmNotify] = useState<{
    type: string;
    priority: number;
    title: string;
    message: string;
    timestamp: number;
  } | null>(null);
  
  // GPS丢失计时器
  const gpsLostStartTimeRef = useRef<number | null>(null);
  
  const socketConnectedRef = useRef(false);
  const speedHistoryRef = useRef<number[]>([]);
  const lastCameraUpdateRef = useRef<number>(0);
  const enableCameraPreviewRef = useRef(enableCameraPreview);

  // 同步 ref 和 state
  useEffect(() => {
    enableCameraPreviewRef.current = enableCameraPreview;
  }, [enableCameraPreview]);

  const subscribeToCamera = useCallback(() => {
    if (enableCameraPreviewRef.current) {
      const status = socketService.getConnectionStatus();

      if (status !== 'connected') {
        socketService.connect();
        // 等待连接后再订阅
        setTimeout(() => {
          socketService.sendRosCommand({
            op: 'subscribe',
            topic: '/camera/color/image_raw',
            type: 'sensor_msgs/Image'
          });
        }, 1000);
      } else {
        socketService.sendRosCommand({
          op: 'subscribe',
          topic: '/camera/color/image_raw',
          type: 'sensor_msgs/Image'
        });
      }
    }
  }, []);

  // 导航点数据（暂时为空，等待从后端获取实际数据）
  const mockNavigationPoints: any[] = [];

  const mockRoadSegments = [
    {
      id: 's1',
      startNavPointId: '1',
      endNavPointId: '2',
    },
    {
      id: 's2',
      startNavPointId: '2',
      endNavPointId: '3',
    },
  ];

  useEffect(() => {
    socketService.connect();
    socketConnectedRef.current = true;

    const subscribeToVelocity = () => {
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/vel_raw',
        type: 'geometry_msgs/Twist'
      });
    };

    const subscribeToRobotPose = () => {
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/robot_pose',
        type: 'geometry_msgs/PoseStamped'
      });
      
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/amcl_pose',
        type: 'geometry_msgs/PoseWithCovarianceStamped'
      });
      
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/odom',
        type: 'nav_msgs/Odometry'
      });
    };

    const handleRosMessage = (data: any) => {
      if (data.topic === '/vel_raw' && data.msg) {
        const now = Date.now();
        if (now - lastVelUpdateRef.current < THROTTLE_MS) return; // 节流
        lastVelUpdateRef.current = now;
        
        const linearVel = data.msg.linear?.x || 0;
        const angularVel = data.msg.angular?.z || 0;
        const rawSpeed = Math.abs(linearVel);
        const filteredSpeed = filterSpeed(rawSpeed);
        setSpeed(filteredSpeed);
        setLinearVelocity(linearVel);
        setAngularVelocity(angularVel);
      }
      
      // 处理电池电量实时更新
      if (data.topic === '/battery_level' && data.msg) {
        const batteryValue = Math.round(data.msg.data || 0);
        setBatteryLevel(batteryValue);
      }
      
      // 处理水位实时更新 - 修复话题名称为 /water_level
      if (data.topic === '/water_level' && data.msg) {
        const waterValue = Math.round(data.msg.data || 0);
        setWaterLevel(waterValue);
      }
      
      if (data.topic === '/camera/color/image_raw' && data.msg) {
        if (!enableCameraPreviewRef.current) {
          return;
        }

        const now = Date.now();
        // 增加节流间隔到1000ms，减少图像处理频率
        if (now - lastCameraUpdateRef.current < 1000) {
          return;
        }
        
        try {
          if (data.msg.data && data.msg.width && data.msg.height) {
            // 原始图像数据，需要转换为可显示格式
            // 使用 Canvas 转换 RGB8 数据为图像
            const canvas = document.createElement('canvas');
            canvas.width = data.msg.width;
            canvas.height = data.msg.height;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              const imageData = ctx.createImageData(data.msg.width, data.msg.height);
              const rawData = new Uint8Array(data.msg.data);
              
              // RGB8 格式转换为 RGBA
              for (let i = 0; i < rawData.length / 3; i++) {
                imageData.data[i * 4] = rawData[i * 3];       // R
                imageData.data[i * 4 + 1] = rawData[i * 3 + 1]; // G
                imageData.data[i * 4 + 2] = rawData[i * 3 + 2]; // B
                imageData.data[i * 4 + 3] = 255;               // A
              }
              
              ctx.putImageData(imageData, 0, 0);
              const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
              setCameraImage(dataUrl);
              lastCameraUpdateRef.current = now;
            }
          }
        } catch {
          // 静默处理错误，避免控制台日志影响性能
        }
      }
      
      // 位姿更新节流
      if ((data.topic === '/robot_pose' || data.topic === '/amcl_pose' || data.topic === '/odom') && data.msg) {
        const now = Date.now();
        if (now - lastPoseUpdateRef.current < THROTTLE_MS) return; // 节流
        lastPoseUpdateRef.current = now;
        
        let position;
        if (data.topic === '/robot_pose' && data.msg.pose) {
          position = data.msg.pose.position;
        } else if (data.topic === '/amcl_pose' && data.msg.pose) {
          position = data.msg.pose.pose.position;
        } else if (data.topic === '/odom' && data.msg.pose) {
          position = data.msg.pose.pose.position;
        }
        
        if (position) {
          setRobotPosition({ x: position.x, y: position.y });
        }
      }

      // 处理GPS数据
      if (data.topic === '/gps/fix' && data.msg) {
        const fix = data.msg;
        setGpsStatus(prev => ({
          quality: prev?.quality ?? 0,
          satellites: prev?.satellites ?? 0,
          hdop: prev?.hdop ?? 99.99,
          latitude: fix.latitude || 0,
          longitude: fix.longitude || 0,
          altitude: fix.altitude || 0,
          isFixed: prev?.quality === 4 || prev?.quality === 5
        }));
      }

      // 处理GPS质量数据（直接从 /gps/quality 话题获取）
      if (data.topic === '/gps/quality' && data.msg) {
        const now = Date.now();
        if (now - lastGpsUpdateRef.current < THROTTLE_MS) return; // 节流
        lastGpsUpdateRef.current = now;
        
        const quality = data.msg.data ?? data.msg ?? 0;
        setGpsStatus(prev => ({
          quality: quality,
          satellites: prev?.satellites ?? 0,
          hdop: prev?.hdop ?? 99.99,
          latitude: prev?.latitude ?? 0,
          longitude: prev?.longitude ?? 0,
          altitude: prev?.altitude ?? 0,
          isFixed: quality === 4 || quality === 5  // RTK Fixed=4, RTK Float=5
        }));
        
        // 检测GPS丢失（quality为0表示无定位）
        // 注意：GPS丢失报警现在由 alarm_manager_node 统一管理
        // 这里只更新本地GPS状态显示，不再手动触发报警
        if (quality === 0) {
          if (!gpsLostStartTimeRef.current) {
            gpsLostStartTimeRef.current = Date.now();
          }
        } else {
          // GPS恢复
          gpsLostStartTimeRef.current = null;
        }
      }

      // 处理GPS状态数据（JSON格式，获取卫星数和HDOP）
      if (data.topic === '/gps/status' && data.msg) {
        try {
          // 尝试解析JSON格式的状态数据
          const statusStr = data.msg.data || data.msg;
          const status = typeof statusStr === 'string' ? JSON.parse(statusStr) : statusStr;
          const statusQuality = parseInt(status.quality) || 0;
          
          setGpsStatus(prev => ({
            quality: statusQuality,  // 直接使用 /gps/status 中的 quality 值
            satellites: status.satellites || 0,
            hdop: status.hdop || 99.99,
            latitude: prev?.latitude ?? 0,
            longitude: prev?.longitude ?? 0,
            altitude: prev?.altitude ?? 0,
            isFixed: statusQuality === 4 || statusQuality === 5  // 用当前quality判断
          }));
        } catch (e) {
          console.error('Failed to parse GPS status:', e);
        }
      }
      
      // ========== 报警管理核心话题 ==========
      
      // 处理活跃报警列表（来自 alarm_manager_node）
      if (data.topic === '/alarm/active' && data.msg) {
        try {
          const alarmData = JSON.parse(data.msg.data || data.msg);
          setAlarmCount(alarmData.count || 0);
          setAlarms(alarmData.alarms || []);
        } catch (e) {
          console.error('Failed to parse active alarms:', e);
        }
      }
      
      // 处理报警通知（用于弹窗提醒）
      if (data.topic === '/alarm/notify' && data.msg) {
        try {
          const notifyData = JSON.parse(data.msg.data || data.msg);
          setAlarmNotify(notifyData);
          
          // 显示弹窗提醒
          const priorityConfig: Record<number, { type: 'success' | 'info' | 'warning' | 'error', icon: React.ReactNode }> = {
            4: { type: 'error', icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} /> },
            3: { type: 'error', icon: <WarningOutlined style={{ color: '#ff4d4f' }} /> },
            2: { type: 'warning', icon: <WarningOutlined style={{ color: '#faad14' }} /> },
            1: { type: 'info', icon: <WarningOutlined style={{ color: '#1890ff' }} /> }
          };
          const config = priorityConfig[notifyData.priority] || priorityConfig[1];
          
          notification[config.type]({
            message: `报警: ${notifyData.title}`,
            description: notifyData.message,
            icon: config.icon,
            duration: notifyData.priority >= 3 ? 0 : 5, // 高优先级不自动关闭
            placement: 'topRight',
            key: notifyData.timestamp?.toString(),
            btn: notifyData.priority >= 3 ? (
              <Button type="primary" size="small" onClick={() => notification.destroy(notifyData.timestamp?.toString())}>
                我知道了
              </Button>
            ) : undefined
          });
          
          // 3秒后自动清除通知状态
          setTimeout(() => setAlarmNotify(null), 3000);
        } catch (e) {
          console.error('Failed to parse alarm notify:', e);
        }
      }
      
      // 兼容旧的 /alarm 话题（简单字符串报警）
      if (data.topic === '/alarm' && data.msg) {
        const alarmMsg = data.msg.data || data.msg;
        // 如果不是JSON格式，当作简单报警处理
        try {
          JSON.parse(alarmMsg);
        } catch {
          // 简单字符串报警，已由 alarm_manager_node 统一管理
        }
      }
    };

    const handleNavigationStatus = (data: NavigationStatus) => {
      setNavigationStatus(data);
    };

    const handleObstacleStatus = (data: ObstacleStatus) => {
      setObstacleStatus(data);
    };

    socketService.onRosMessage(handleRosMessage);
    socketService.on('navigation_status', handleNavigationStatus);
    socketService.on('obstacle_status', handleObstacleStatus);
    
    subscribeToVelocity();
    subscribeToCamera();
    subscribeToRobotPose();
    loadInitialData();

    // 订阅电池和水位数据
    const subscribeToBatteryAndWater = () => {
      // 订阅电池电量
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/battery_level',
        type: 'std_msgs/Float32'
      });

      // 订阅水位
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/water_level',
        type: 'std_msgs/Float32'
      });
    };

    // 订阅GPS数据（使用BEST_EFFORT QoS匹配rtk_gps_node发布者）
    const subscribeToGPS = () => {
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

      // 订阅GPS质量（直接获取RTK质量值）
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

      // 订阅GPS状态（JSON格式，包含卫星数和HDOP）
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/gps/status',
        type: 'std_msgs/String'
      });
    };

    // 订阅报警相关话题（使用 alarm_manager_node 的核心话题）
    const subscribeToAlarms = () => {
      // 活跃报警列表（来自 alarm_manager_node）
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/alarm/active',
        type: 'std_msgs/String'
      });

      // 报警通知（用于弹窗提醒）
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/alarm/notify',
        type: 'std_msgs/String'
      });

      // 兼容旧的 /alarm 话题
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/alarm',
        type: 'std_msgs/String'
      });
    };

    subscribeToBatteryAndWater();
    subscribeToGPS();
    subscribeToAlarms();
    
    // 通过API检测传感器在线状态（每10秒检测一次）
    const checkSensorsStatus = async () => {
      try {
        const status = await systemApi.getSystemStatus();
        if (status && status.functionalNodes && status.functionalNodes.sensors) {
          setLidarOnline(status.functionalNodes.sensors.lidar === true);
          setCameraOnline(status.functionalNodes.sensors.camera === true);
        }
      } catch {
        // 静默处理错误，避免日志影响性能
      }
    };
    checkSensorsStatus(); // 初始检测
    const sensorStatusInterval = setInterval(checkSensorsStatus, 10000);

    // 注意：电池和水位数据已通过 WebSocket 实时订阅（/battery_level, /water_level）
    // 不再需要 HTTP 轮询，减少网络请求和 CPU 占用

    return () => {
      clearInterval(sensorStatusInterval);
      
      if (socketConnectedRef.current) {
        socketService.off('ros_message', handleRosMessage);
        socketService.off('navigation_status', handleNavigationStatus);
        socketService.off('obstacle_status', handleObstacleStatus);
        
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/vel_raw' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/camera/color/image_raw/compressed' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/robot_pose' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/amcl_pose' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/odom' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/battery_level' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/water_level' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/gps/fix' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/gps/status' });
        
        socketService.disconnect();
        socketConnectedRef.current = false;
      }
    };
  }, [subscribeToCamera]);

  useEffect(() => {
    if (enableCameraPreview && !useWebVideoServer) {
      // 只有不使用 web_video_server 时才通过 WebSocket 订阅
      subscribeToCamera();
    } else if (!enableCameraPreview) {
      socketService.sendRosCommand({
        op: 'unsubscribe',
        topic: '/camera/color/image_raw'
      });
      setCameraImage(null);
    }
  }, [enableCameraPreview, useWebVideoServer, subscribeToCamera]);

  const loadInitialData = async () => {
    try {
      // 并行加载所有初始数据（使用本地端点，不需要认证）
      const [obstacleData, batteryData, waterData] = await Promise.all([
        obstacleApi.getStatus().catch(() => null),
        fetch('/api/robot/battery/status-local')
          .then(res => res.ok ? res.json() : null).catch(() => null),
        fetch('/api/robot/water/status-local')
          .then(res => res.ok ? res.json() : null).catch(() => null)
      ]);

      if (obstacleData) {
        setObstacleStatus(obstacleData);
      }

      if (batteryData && batteryData.batteryLevel !== undefined) {
        setBatteryLevel(batteryData.batteryLevel);
      }

      if (waterData && waterData.waterLevel !== undefined) {
        setWaterLevel(waterData.waterLevel);
      }

      setDataLoading(false);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setDataLoading(false);
    }
  };

  const handlePause = async () => {
    if (!navigationStatus) return;
    setControlLoading(true);
    try {
      await navigationApi.pauseNavigation(navigationStatus.taskId);
    } catch (error) {
      console.error('Failed to pause navigation:', error);
    } finally {
      setControlLoading(false);
    }
  };

  const handleResume = async () => {
    if (!navigationStatus) return;
    setControlLoading(true);
    try {
      await navigationApi.resumeNavigation(navigationStatus.taskId);
    } catch (error) {
      console.error('Failed to resume navigation:', error);
    } finally {
      setControlLoading(false);
    }
  };

  const handleStop = async () => {
    if (!navigationStatus) return;
    setControlLoading(true);
    try {
      await navigationApi.stopNavigation(navigationStatus.taskId);
    } catch (error) {
      console.error('Failed to stop navigation:', error);
    } finally {
      setControlLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      idle: 'default',
      running: 'processing',
      paused: 'warning',
      pending: 'default',
      completed: 'success',
      failed: 'error',
    };
    return colors[status] || 'default';
  };

  const getObstacleColor = (status: string) => {
    const colors: Record<string, string> = {
      CLEAR: 'success',
      CAUTION: 'warning',
      WARNING: 'warning',
      CONFIRMED: 'error',
      UNKNOWN: 'default',
    };
    return colors[status] || 'default';
  };

  const filterSpeed = (rawSpeed: number): number => {
    const DEADZONE_THRESHOLD = 0.02;
    const HISTORY_SIZE = 5;
    
    if (Math.abs(rawSpeed) < DEADZONE_THRESHOLD) {
      return 0;
    }
    
    speedHistoryRef.current.push(rawSpeed);
    if (speedHistoryRef.current.length > HISTORY_SIZE) {
      speedHistoryRef.current.shift();
    }
    
    const avgSpeed = speedHistoryRef.current.reduce((sum, s) => sum + s, 0) / speedHistoryRef.current.length;
    
    if (Math.abs(avgSpeed) < DEADZONE_THRESHOLD) {
      return 0;
    }
    
    return avgSpeed;
  };

  // 报警确认
  const handleAcknowledgeAlarm = async (alarmId: string) => {
    try {
      // 通过 rosbridge 调用服务
      socketService.sendRosCommand({
        op: 'call_service',
        service: '/alarm/acknowledge',
        type: 'std_srvs/srv/Trigger',
        args: { request: { alarm_id: alarmId } }
      });
      
      // 本地更新状态（乐观更新）
      setAlarms(prev => prev.map(a => 
        a.alarm_id === alarmId ? { ...a, acknowledged: true } : a
      ));
    } catch (error) {
      console.error('Failed to acknowledge alarm:', error);
    }
  };

  // 报警清除
  const handleClearAlarm = async (alarmId: string) => {
    try {
      // 通过 rosbridge 调用服务
      socketService.sendRosCommand({
        op: 'call_service',
        service: '/alarm/clear',
        type: 'std_srvs/srv/Trigger',
        args: { request: { alarm_id: alarmId } }
      });
      
      // 本地移除报警（乐观更新）
      setAlarms(prev => prev.filter(a => a.alarm_id !== alarmId));
      setAlarmCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to clear alarm:', error);
    }
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#f0f2f5', minHeight: '100vh' }}>
      {/* 第一行：基础状态（4个） */}
      <Row gutter={[16, 16]} style={{ marginBottom: '16px' }}>
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                🔋 电池电量
              </div>
              {dataLoading || batteryLevel === null ? (
                <div style={{ 
                  fontSize: '28px', 
                  fontWeight: 600, 
                  color: '#999',
                  marginBottom: '8px'
                }}>
                  加载中...
                </div>
              ) : (
                <>
                  <div style={{ 
                    fontSize: '28px', 
                    fontWeight: 600, 
                    color: batteryLevel > 20 ? '#52c41a' : '#ff4d4f',
                    marginBottom: '8px'
                  }}>
                    {batteryLevel.toFixed(2)}%
                  </div>
                  <Progress 
                    percent={parseFloat(batteryLevel.toFixed(2))} 
                    size="small" 
                    showInfo={false}
                    status={batteryLevel > 20 ? 'active' : 'exception'}
                    strokeColor={batteryLevel > 20 ? '#52c41a' : '#ff4d4f'}
                  />
                </>
              )}
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                💧 水箱水位
              </div>
              {dataLoading || waterLevel === null ? (
                <div style={{ 
                  fontSize: '28px', 
                  fontWeight: 600, 
                  color: '#999',
                  marginBottom: '8px'
                }}>
                  加载中...
                </div>
              ) : (
                <>
                  <div style={{ 
                    fontSize: '28px', 
                    fontWeight: 600, 
                    color: waterLevel > 10 ? '#1890ff' : '#ff4d4f',
                    marginBottom: '8px'
                  }}>
                    {waterLevel.toFixed(2)}%
                  </div>
                  <Progress 
                    percent={parseFloat(waterLevel.toFixed(2))} 
                    size="small" 
                    showInfo={false}
                    status={waterLevel > 10 ? 'active' : 'exception'}
                    strokeColor={waterLevel > 10 ? '#1890ff' : '#ff4d4f'}
                  />
                </>
              )}
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                🚀 移动速度
              </div>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#722ed1', marginBottom: '4px' }}>
                {linearVelocity.toFixed(2)} m/s
              </div>
              <div style={{ fontSize: '16px', fontWeight: 500, color: '#1890ff' }}>
                {(angularVelocity * 180 / Math.PI).toFixed(1)}°/s
              </div>
              <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>线速度 / 角速度</div>
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                📍 机器人位置
              </div>
              <div style={{ fontSize: '18px', fontWeight: 600, color: '#fa8c16' }}>
                <div style={{ marginBottom: '4px' }}>横坐标: {robotPosition ? robotPosition.x.toFixed(2) : '--'}米</div>
                <div>纵坐标: {robotPosition ? robotPosition.y.toFixed(2) : '--'}米</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* GPS状态行 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '20px' }}>
        <Col xs={24} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                <GlobalOutlined style={{ marginRight: 8 }} />
                GPS 定位状态
              </div>
              {gpsStatus ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <Badge 
                      status={gpsStatus.isFixed ? 'success' : 'error'} 
                      text={
                        <span style={{ 
                          fontSize: '16px', 
                          fontWeight: 600, 
                          color: gpsStatus.isFixed ? '#52c41a' : '#ff4d4f' 
                        }}>
                          {gpsStatus.isFixed ? '✓ 已定位' : '✗ 未定位'}
                        </span>
                      }
                    />
                  </div>
                  <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                    质量: {gpsStatus.quality === 0 ? '无定位' : 
                           gpsStatus.quality === 1 ? 'GPS定位' : 
                           gpsStatus.quality === 2 ? 'DGPS定位' : 
                           gpsStatus.quality === 4 ? 'RTK固定解' : '未知'}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: '#999' }}>等待GPS数据...</div>
              )}
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                <CompassOutlined style={{ marginRight: 8 }} />
                卫星信息
              </div>
              {gpsStatus ? (
                <>
                  <div style={{ fontSize: '24px', fontWeight: 600, color: '#1890ff', marginBottom: '4px' }}>
                    {gpsStatus.satellites} 颗
                  </div>
                  <div style={{ fontSize: '12px', color: '#999' }}>
                    HDOP: {gpsStatus.hdop.toFixed(2)} {gpsStatus.hdop < 1 ? '(优)' : gpsStatus.hdop < 2 ? '(良)' : gpsStatus.hdop < 5 ? '(中)' : '(差)'}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: '#999' }}>等待数据...</div>
              )}
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                📍 GPS坐标
              </div>
              {gpsStatus && gpsStatus.latitude !== 0 ? (
                <Tooltip title={`经度: ${gpsStatus.longitude?.toFixed(6) || '--'}°, 纬度: ${gpsStatus.latitude?.toFixed(6) || '--'}°`}>
                  <div style={{ fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
                    <div>纬度: {gpsStatus.latitude?.toFixed(6) || '--'}°</div>
                    <div>经度: {gpsStatus.longitude?.toFixed(6) || '--'}°</div>
                    <div>海拔: {gpsStatus.altitude?.toFixed(1) || '--'} m</div>
                  </div>
                </Tooltip>
              ) : (
                <div style={{ fontSize: '14px', color: '#999' }}>无有效坐标</div>
              )}
            </div>
          </Card>
        </Col>
        
        {/* 系统报警 */}
        <Col xs={24} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: alarms.length > 0 ? '0 2px 8px rgba(255,77,79,0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: alarms.length > 0 ? '2px solid #ff4d4f' : 'none',
              background: alarms.length > 0 ? '#fff2f0' : '#fff'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                {alarms.length > 0 ? `⚠️ 系统报警 (${alarmCount})` : '✅ 系统状态'}
              </div>
              {alarms.length > 0 ? (
                <div style={{ maxHeight: 120, overflow: 'auto' }}>
                  {alarms.map((alarm) => {
                    const priorityConfig = {
                      4: { label: '严重', color: '#ff4d4f', bg: '#fff1f0', icon: '🔴' },
                      3: { label: '高', color: '#fa8c16', bg: '#fff7e6', icon: '🟠' },
                      2: { label: '中', color: '#faad14', bg: '#fffbe6', icon: '🟡' },
                      1: { label: '低', color: '#1890ff', bg: '#e6f7ff', icon: '🔵' }
                    };
                    const config = priorityConfig[alarm.priority as keyof typeof priorityConfig] || priorityConfig[1];
                    const timeStr = new Date(alarm.timestamp * 1000).toLocaleTimeString();
                    
                    return (
                      <div 
                        key={alarm.alarm_id}
                        style={{ 
                          fontSize: '11px', 
                          color: config.color,
                          marginBottom: '4px',
                          padding: '4px 6px',
                          background: config.bg,
                          borderRadius: '4px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>
                          {config.icon} [{config.label}] {alarm.message}
                          {alarm.count > 1 && <span style={{marginLeft: 4}}>(×{alarm.count})</span>}
                          <span style={{marginLeft: 4, color: '#999'}}>{timeStr}</span>
                        </span>
                        <Space size={4}>
                          {!alarm.acknowledged && (
                            <Button 
                              size="small" 
                              type="link"
                              style={{ fontSize: '10px', padding: '0 4px', height: 'auto' }}
                              onClick={() => handleAcknowledgeAlarm(alarm.alarm_id)}
                            >
                              确认
                            </Button>
                          )}
                          <Button 
                            size="small" 
                            type="link"
                            danger
                            style={{ fontSize: '10px', padding: '0 4px', height: 'auto' }}
                            onClick={() => handleClearAlarm(alarm.alarm_id)}
                          >
                            清除
                          </Button>
                        </Space>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '14px', color: '#52c41a', fontWeight: 500 }}>
                  ✓ 所有系统正常
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 第二行：传感器和任务状态（4个） */}
      <Row gutter={[16, 16]} style={{ marginBottom: '20px' }}>
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                📡 激光雷达
              </div>
              {!lidarOnline ? (
                <>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: '#ff4d4f' }}>
                    ✗ 传感器离线
                  </div>
                  <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                    请启动雷达节点
                  </div>
                </>
              ) : obstacleStatus?.laser_detected ? (
                <>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: 600, 
                    color: '#ff4d4f'
                  }}>
                    ⚠️ 检测到障碍
                  </div>
                  {obstacleStatus?.closest_laser_distance !== null && obstacleStatus?.closest_laser_distance !== undefined && (
                    <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                      最近距离: {obstacleStatus.closest_laser_distance.toFixed(2)}米
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: 600, 
                    color: '#52c41a'
                  }}>
                    ✓ 正常运行
                  </div>
                  <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                    无障碍物
                  </div>
                </>
              )}
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                📷 深度相机
              </div>
              {!cameraOnline ? (
                <>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: '#ff4d4f' }}>
                    ✗ 传感器离线
                  </div>
                  <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                    请启动相机节点
                  </div>
                </>
              ) : obstacleStatus?.camera_detected ? (
                <>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: 600, 
                    color: '#ff4d4f'
                  }}>
                    ⚠️ 检测到障碍
                  </div>
                  {obstacleStatus?.closest_depth_distance !== null && obstacleStatus?.closest_depth_distance !== undefined && (
                    <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                      最近距离: {obstacleStatus.closest_depth_distance.toFixed(2)}米
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: 600, 
                    color: '#52c41a'
                  }}>
                    ✓ 正常运行
                  </div>
                  <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                    无障碍物
                  </div>
                </>
              )}
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                {obstacleStatus?.status === 'CLEAR' ? '✅' : '⚠️'} 障碍物检测
              </div>
              {obstacleStatus ? (
                <>
                  <Tag 
                    color={getObstacleColor(obstacleStatus.status)}
                    style={{ fontSize: '16px', padding: '6px 16px', marginBottom: '12px' }}
                  >
                    {obstacleStatus.message}
                  </Tag>
                  <div style={{ 
                    fontSize: '14px',
                    color: obstacleStatus.action === 'stop' ? '#ff4d4f' : 
                           obstacleStatus.action === 'slow' ? '#faad14' : '#52c41a',
                    fontWeight: 500
                  }}>
                    建议: {obstacleStatus.action === 'continue' ? '继续前进' : 
                          obstacleStatus.action === 'slow' ? '减速行驶' : 
                          obstacleStatus.action === 'stop' ? '立即停止' : '等待指令'}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: '#999' }}>
                  等待检测数据
                </div>
              )}
            </div>
          </Card>
        </Col>
        
        <Col xs={12} sm={12} md={6} lg={6} xl={6}>
          <Card 
            size="small"
            style={{ 
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 500 }}>
                🎯 任务与导航
              </div>
              <Space vertical size="small" style={{ width: '100%' }}>
                <Tag 
                  color={getStatusColor(taskStatus)} 
                  style={{ fontSize: '14px', padding: '4px 12px', width: '100%' }}
                >
                  任务: {taskStatus === 'idle' ? '空闲' : taskStatus === 'running' ? '运行中' : '已暂停'}
                </Tag>
                <Tag 
                  color={navigationStatus ? getStatusColor(navigationStatus.status) : 'default'}
                  style={{ fontSize: '14px', padding: '4px 12px', width: '100%' }}
                >
                  导航: {navigationStatus ? navigationStatus.status : '无任务'}
                </Tag>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 主要内容区域：地图和相机并排 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card 
            title={<span style={{ fontSize: '16px', fontWeight: 600 }}>🗺️ 地图监控</span>}
            style={{ 
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
            styles={{ body: { padding: '16px' } }}
          >
            <div style={{ 
              width: '100%',
              height: '480px',
              backgroundColor: 'transparent',
              borderRadius: '4px',
              overflow: 'hidden',
              position: 'relative'
            }}>
              <MapViewer
                navigationPoints={mockNavigationPoints}
                roadSegments={mockRoadSegments}
                robotPosition={robotPosition}
                center={mapCenter}
                zoom={16}
                onMapLoaded={handleMapLoaded}
              />
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card 
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span style={{ fontSize: '16px', fontWeight: 600 }}>
                  📷 相机预览
                </span>
                <Switch 
                  checked={enableCameraPreview}
                  onChange={setEnableCameraPreview}
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                />
              </div>
            }
            style={{ 
              boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              borderRadius: '8px',
              height: '100%',
              border: 'none'
            }}
            styles={{ body: { padding: '16px' } }}
          >
            <div style={{ 
              height: '480px', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: enableCameraPreview ? '#1a1a1a' : '#f5f5f5',
              borderRadius: '4px',
              overflow: 'hidden',
              position: 'relative'
            }}>
              {enableCameraPreview && useWebVideoServer ? (
                <img 
                  src={`http://${window.location.hostname}:8080/stream?topic=/camera/color/image_raw&type=mjpeg&quality=80`}
                  alt="相机画面" 
                  style={{ 
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain'
                  }}
                  onError={(e) => {
                    console.error('Failed to load video stream from web_video_server');
                    // 回退到 WebSocket 方式
                    setUseWebVideoServer(false);
                  }}
                />
              ) : cameraImage ? (
                <img 
                  src={cameraImage} 
                  alt="相机画面" 
                  style={{ 
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    transform: 'translateZ(0)',
                    willChange: 'transform',
                    backfaceVisibility: 'hidden'
                  }}
                />
              ) : (
                <div style={{ 
                  textAlign: 'center',
                  padding: '40px'
                }}>
                  <EyeOutlined style={{ 
                    fontSize: '64px', 
                    color: enableCameraPreview ? '#666' : '#bfbfbf',
                    marginBottom: '20px',
                    display: 'block'
                  }} />
                  <div style={{ 
                    color: enableCameraPreview ? '#999' : '#8c8c8c',
                    fontSize: '18px',
                    fontWeight: 500,
                    marginBottom: '8px'
                  }}>
                    {enableCameraPreview ? '等待相机数据传输...' : '相机预览已关闭'}
                  </div>
                  <div style={{ 
                    color: enableCameraPreview ? '#666' : '#bfbfbf',
                    fontSize: '14px'
                  }}>
                    {enableCameraPreview ? '请稍候，正在连接相机' : '点击右上角开关开启预览'}
                  </div>
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      {/* 导航控制（如果有导航任务） */}
      {navigationStatus && (
        <Card 
          title={<span style={{ fontSize: '16px', fontWeight: 600 }}>🧭 导航控制</span>}
          style={{ 
            marginTop: '16px',
            boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
            borderRadius: '8px',
            border: 'none'
          }}
          styles={{ body: { padding: '20px' } }}
        >
          <Row gutter={[24, 16]}>
            <Col xs={24} lg={8}>
              <div style={{ 
                padding: '20px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                height: '100%'
              }}>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                  导航进度
                </div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: '#1890ff', marginBottom: '12px' }}>
                  {navigationStatus.currentIndex + 1} / {navigationStatus.totalPoints}
                </div>
                <Progress
                  percent={parseFloat(navigationStatus.progress.toFixed(2))}
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                  status={navigationStatus.status === 'running' ? 'active' : 'normal'}
                />
              </div>
            </Col>
            <Col xs={24} lg={8}>
              {navigationStatus.currentPoint && (
                <div style={{ 
                  padding: '20px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '8px',
                  height: '100%'
                }}>
                  <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
                    当前目标点
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 600, color: '#722ed1', marginBottom: '4px' }}>
                    {navigationStatus.currentPoint.pointName}
                  </div>
                  <div style={{ fontSize: '13px', color: '#999' }}>
                    坐标: ({navigationStatus.currentPoint.position.x.toFixed(2)}, {navigationStatus.currentPoint.position.y.toFixed(2)})
                  </div>
                </div>
              )}
            </Col>
            <Col xs={24} lg={8}>
              <Space size="middle" style={{ width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
                {navigationStatus.status === 'running' && (
                  <Button
                    size="large"
                    icon={<PauseOutlined />}
                    onClick={handlePause}
                    loading={controlLoading}
                    style={{ minWidth: '100px' }}
                  >
                    暂停导航
                  </Button>
                )}
                {navigationStatus.status === 'paused' && (
                  <Button
                    size="large"
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={handleResume}
                    loading={controlLoading}
                    style={{ minWidth: '100px' }}
                  >
                    恢复导航
                  </Button>
                )}
                {(navigationStatus.status === 'running' || navigationStatus.status === 'paused') && (
                  <Button
                    size="large"
                    danger
                    icon={<StopOutlined />}
                    onClick={handleStop}
                    loading={controlLoading}
                    style={{ minWidth: '100px' }}
                  >
                    停止导航
                  </Button>
                )}
              </Space>
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
};

export default StatusMonitor;