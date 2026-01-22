import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Row, Col, Progress, Tag, Button, Space, Switch } from 'antd';
import { 
  PlayCircleOutlined, 
  PauseOutlined, 
  StopOutlined,
  EyeOutlined
} from '@ant-design/icons';
import MapViewer from '../components/MapViewer';
import { socketService } from '../services/socket';
import { navigationApi, obstacleApi } from '../services/navigationApi';
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
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [waterLevel, setWaterLevel] = useState(70);
  const [linearVelocity, setLinearVelocity] = useState(0); // 线速度 m/s
  const [angularVelocity, setAngularVelocity] = useState(0); // 角速度 rad/s

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
        const linearVel = data.msg.linear?.x || 0;
        const angularVel = data.msg.angular?.z || 0;
        const rawSpeed = Math.abs(linearVel);
        const filteredSpeed = filterSpeed(rawSpeed);
        setSpeed(filteredSpeed);
        setLinearVelocity(linearVel);
        setAngularVelocity(angularVel);
      }
      
      if (data.topic === '/camera/color/image_raw' && data.msg) {
        if (!enableCameraPreviewRef.current) {
          return;
        }

        const now = Date.now();
        if (now - lastCameraUpdateRef.current < 500) {
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
              const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
              setCameraImage(dataUrl);
              lastCameraUpdateRef.current = now;
            }
          }
        } catch (error) {
          console.error('Error processing camera image:', error);
        }
      }
      
      if (data.topic === '/robot_pose' && data.msg && data.msg.pose) {
        const position = data.msg.pose.position;
        setRobotPosition({ x: position.x, y: position.y });
      }
      
      if (data.topic === '/amcl_pose' && data.msg && data.msg.pose) {
        const position = data.msg.pose.pose.position;
        setRobotPosition({ x: position.x, y: position.y });
      }
      
      if (data.topic === '/odom' && data.msg && data.msg.pose) {
        const position = data.msg.pose.pose.position;
        setRobotPosition({ x: position.x, y: position.y });
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

    const interval = setInterval(() => {
      setBatteryLevel((prev) => Math.max(0, prev - 0.1));
      setWaterLevel((prev) => Math.max(0, prev - 0.15));
    }, 1000);

    return () => {
      clearInterval(interval);
      
      if (socketConnectedRef.current) {
        socketService.off('ros_message', handleRosMessage);
        socketService.off('navigation_status', handleNavigationStatus);
        socketService.off('obstacle_status', handleObstacleStatus);
        
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/vel_raw' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/camera/color/image_raw/compressed' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/robot_pose' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/amcl_pose' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/odom' });
        
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
      const obstacleData = await obstacleApi.getStatus();
      setObstacleStatus(obstacleData);
    } catch (error) {
      console.error('Failed to load initial data:', error);
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
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 600, 
                color: obstacleStatus?.laser_detected ? '#ff4d4f' : '#52c41a'
              }}>
                {obstacleStatus?.laser_detected ? '⚠️ 检测到障碍' : '✓ 正常运行'}
              </div>
              {obstacleStatus?.closest_laser_distance !== null && obstacleStatus?.closest_laser_distance !== undefined && (
                <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                  最近距离: {obstacleStatus.closest_laser_distance.toFixed(2)}米
                </div>
              )}
              {!obstacleStatus && (
                <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                  等待传感器数据
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
                📷 深度相机
              </div>
              <div style={{ 
                fontSize: '18px', 
                fontWeight: 600, 
                color: obstacleStatus?.camera_detected ? '#ff4d4f' : '#52c41a'
              }}>
                {obstacleStatus?.camera_detected ? '⚠️ 检测到障碍' : '✓ 正常运行'}
              </div>
              {obstacleStatus?.closest_depth_distance !== null && obstacleStatus?.closest_depth_distance !== undefined && (
                <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                  最近距离: {obstacleStatus.closest_depth_distance.toFixed(2)}米
                </div>
              )}
              {!obstacleStatus && (
                <div style={{ fontSize: '14px', color: '#999', marginTop: '8px' }}>
                  等待传感器数据
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