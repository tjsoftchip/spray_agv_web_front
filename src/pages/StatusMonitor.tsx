import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { Card, Row, Col, Statistic, Progress, Tag, Button, Space, Alert } from 'antd';
import { 
  ThunderboltOutlined, 
  DashboardOutlined, 
  DropboxOutlined, 
  PlayCircleOutlined, 
  PauseOutlined, 
  StopOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  EyeOutlined
} from '@ant-design/icons';
import MapViewer from '../components/MapViewer';
import Loading from '../components/Loading';
import { socketService } from '../services/socket';
import { navigationApi, obstacleApi } from '../services/navigationApi';

const ReactECharts = lazy(() => import('echarts-for-react'));

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

interface ObstacleStatus {
  status: string;
  message: string;
  laser_detected: boolean;
  camera_detected: boolean;
  closest_laser_distance?: number;
  closest_depth_distance?: number;
  action: string;
  timestamp: number;
}

const StatusMonitor: React.FC = () => {
  const [robotPosition, setRobotPosition] = useState({ x: 0, y: 0 });
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [waterLevel, setWaterLevel] = useState(70);
  const [speed, setSpeed] = useState(0);
  const [taskStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [navigationStatus, setNavigationStatus] = useState<NavigationStatus | null>(null);
  const [obstacleStatus, setObstacleStatus] = useState<ObstacleStatus | null>(null);
  const [cameraImage, setCameraImage] = useState<string | null>(null);
  const [controlLoading, setControlLoading] = useState(false);
  const [mapCenter] = useState<[number, number]>([0, 0]);
  
  const socketConnectedRef = useRef(false);
  const speedHistoryRef = useRef<number[]>([]);
  const batteryChartRef = useRef<any>(null);
  const waterChartRef = useRef<any>(null);

  const mockNavigationPoints = [
    {
      id: '1',
      name: '起点',
      position: { x: 0, y: 0, z: 0 },
      type: 'start' as const,
      order: 1,
    },
    {
      id: '2',
      name: '路径点1',
      position: { x: 0.0005, y: 0.0005, z: 0 },
      type: 'waypoint' as const,
      order: 2,
    },
    {
      id: '3',
      name: '终点',
      position: { x: 0.001, y: 0.001, z: 0 },
      type: 'end' as const,
      order: 3,
    },
  ];

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

    // 订阅 /vel_raw 话题获取速度（修复速度话题）
    const subscribeToVelocity = () => {
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/vel_raw',
        type: 'geometry_msgs/Twist'
      });
    };

    // 订阅相机图像话题
    const subscribeToCamera = () => {
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/camera/image_raw',
        type: 'sensor_msgs/CompressedImage'
      });
    };

    // 订阅机器人位置话题
    const subscribeToRobotPose = () => {
      // 订阅 robot_pose 话题（建图时使用）
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/robot_pose',
        type: 'geometry_msgs/PoseStamped'
      });
      
      // 订阅 amcl_pose 话题（导航时使用）
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/amcl_pose',
        type: 'geometry_msgs/PoseWithCovarianceStamped'
      });
      
      // 订阅 odom 话题作为备选
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/odom',
        type: 'nav_msgs/Odometry'
      });
    };

    // 监听ROS消息
    const handleRosMessage = (data: any) => {
      if (data.topic === '/vel_raw' && data.msg) {
        // 从Twist消息中提取速度信息
        const linearVel = data.msg.linear?.x || 0;
        const angularVel = data.msg.angular?.z || 0;
        
        // 计算合速度 (线速度的绝对值)
        const rawSpeed = Math.abs(linearVel);
        const filteredSpeed = filterSpeed(rawSpeed);
        setSpeed(filteredSpeed);
        
        console.log('Velocity data received:', {
          linearVel,
          angularVel,
          rawSpeed,
          filteredSpeed
        });
      }
      
      if (data.topic === '/camera/image_raw' && data.msg) {
        // 处理相机图像
        if (data.msg.data) {
          const imageData = `data:image/jpeg;base64,${data.msg.data}`;
          setCameraImage(imageData);
        }
      }
      
      // 处理机器人位置消息
      if (data.topic === '/robot_pose' && data.msg && data.msg.pose) {
        const position = data.msg.pose.position;
        setRobotPosition({ x: position.x, y: position.y });
        console.log('Robot pose updated from /robot_pose:', { x: position.x, y: position.y });
      }
      
      if (data.topic === '/amcl_pose' && data.msg && data.msg.pose) {
        const position = data.msg.pose.pose.position;
        setRobotPosition({ x: position.x, y: position.y });
        console.log('Robot pose updated from /amcl_pose:', { x: position.x, y: position.y });
      }
      
      if (data.topic === '/odom' && data.msg && data.msg.pose) {
        const position = data.msg.pose.pose.position;
        setRobotPosition({ x: position.x, y: position.y });
        console.log('Robot pose updated from /odom:', { x: position.x, y: position.y });
      }
    };

    // 监听导航和障碍物状态
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
      
      // 清理ECharts实例
      try {
        if (batteryChartRef.current) {
          const echartsInstance = batteryChartRef.current.getEchartsInstance?.();
          if (echartsInstance && typeof echartsInstance.dispose === 'function') {
            echartsInstance.dispose();
          }
        }
        if (waterChartRef.current) {
          const echartsInstance = waterChartRef.current.getEchartsInstance?.();
          if (echartsInstance && typeof echartsInstance.dispose === 'function') {
            echartsInstance.dispose();
          }
        }
      } catch (error) {
        console.error('Error disposing ECharts instances:', error);
      }
      
      if (socketConnectedRef.current) {
        socketService.off('ros_message', handleRosMessage);
        socketService.off('navigation_status', handleNavigationStatus);
        socketService.off('obstacle_status', handleObstacleStatus);
        
        // 取消订阅话题
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/vel_raw' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/camera/image_raw' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/robot_pose' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/amcl_pose' });
        socketService.sendRosCommand({ op: 'unsubscribe', topic: '/odom' });
        
        socketService.disconnect();
        socketConnectedRef.current = false;
      }
    };
  }, []);

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

  // 速度滤波函数
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
    <div style={{ padding: '16px' }}>
      {/* 状态概览 - 紧凑排列 */}
      <Row gutter={[12, 12]} style={{ marginBottom: '16px' }}>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <Statistic
              title={<span style={{ fontSize: '12px' }}>电池</span>}
              value={batteryLevel}
              suffix="%"
              prefix={<ThunderboltOutlined />}
              valueStyle={{ fontSize: '14px', color: batteryLevel > 20 ? '#3f8600' : '#cf1322' }}
            />
            <Progress 
              percent={batteryLevel} 
              size="small" 
              showInfo={false}
              status={batteryLevel > 20 ? 'active' : 'exception'} 
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <Statistic
              title={<span style={{ fontSize: '12px' }}>水位</span>}
              value={waterLevel}
              suffix="%"
              prefix={<DropboxOutlined />}
              valueStyle={{ fontSize: '14px', color: waterLevel > 10 ? '#3f8600' : '#cf1322' }}
            />
            <Progress 
              percent={waterLevel} 
              size="small" 
              showInfo={false}
              status={waterLevel > 10 ? 'active' : 'exception'} 
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <Statistic
              title={<span style={{ fontSize: '12px' }}>速度</span>}
              value={speed}
              suffix="m/s"
              prefix={<DashboardOutlined />}
              valueStyle={{ fontSize: '14px' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <div style={{ marginBottom: '4px' }}>
              <span style={{ fontSize: '12px' }}>任务状态</span>
            </div>
            <Tag 
              color={getStatusColor(taskStatus)} 
              style={{ fontSize: '12px', padding: '2px 8px' }}
            >
              {taskStatus === 'idle' ? '空闲' : taskStatus === 'running' ? '运行中' : '已暂停'}
            </Tag>
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <Statistic
              title={<span style={{ fontSize: '12px' }}>位置</span>}
              value={`(${robotPosition.x.toFixed(3)}, ${robotPosition.y.toFixed(3)})`}
              valueStyle={{ fontSize: '12px' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Card size="small" bodyStyle={{ padding: '12px' }}>
            <div style={{ marginBottom: '4px' }}>
              <span style={{ fontSize: '12px' }}>导航状态</span>
            </div>
            <Tag 
              color={navigationStatus ? getStatusColor(navigationStatus.status) : 'default'}
              style={{ fontSize: '12px', padding: '2px 8px' }}
            >
              {navigationStatus ? navigationStatus.status : '无任务'}
            </Tag>
          </Card>
        </Col>
      </Row>

      {/* 主要内容区域 */}
      <Row gutter={[12, 12]}>
        {/* 左侧：地图和导航控制 */}
        <Col xs={24} lg={12}>
          <Card 
            title="地图监控" 
            size="small" 
            bodyStyle={{ padding: '12px' }}
            style={{ marginBottom: '12px' }}
          >
            <MapViewer
              navigationPoints={mockNavigationPoints}
              roadSegments={mockRoadSegments}
              robotPosition={robotPosition}
              center={mapCenter}
              zoom={16}
            />
          </Card>

          {/* 导航控制 */}
          {navigationStatus && (
            <Card title="导航控制" size="small" bodyStyle={{ padding: '12px' }}>
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <div>
                  <Tag color={getStatusColor(navigationStatus.status)}>
                    {navigationStatus.status}
                  </Tag>
                  <span style={{ marginLeft: 8, fontSize: '12px' }}>
                    {navigationStatus.currentIndex + 1}/{navigationStatus.totalPoints}
                  </span>
                </div>
                <Progress
                  percent={navigationStatus.progress}
                  size="small"
                  status={navigationStatus.status === 'running' ? 'active' : 'normal'}
                />
                <Space>
                  {navigationStatus.status === 'running' && (
                    <Button
                      size="small"
                      icon={<PauseOutlined />}
                      onClick={handlePause}
                      loading={controlLoading}
                    >
                      暂停
                    </Button>
                  )}
                  {navigationStatus.status === 'paused' && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<PlayCircleOutlined />}
                      onClick={handleResume}
                      loading={controlLoading}
                    >
                      恢复
                    </Button>
                  )}
                  {(navigationStatus.status === 'running' || navigationStatus.status === 'paused') && (
                    <Button
                      size="small"
                      danger
                      icon={<StopOutlined />}
                      onClick={handleStop}
                      loading={controlLoading}
                    >
                      停止
                    </Button>
                  )}
                </Space>
              </Space>
            </Card>
          )}
        </Col>

        {/* 右侧：相机预览和障碍物检测 */}
        <Col xs={24} lg={12}>
          {/* 相机预览 */}
          <Card 
            title={
              <Space>
                <EyeOutlined />
                <span>相机预览</span>
              </Space>
            } 
            size="small" 
            bodyStyle={{ padding: '12px' }}
            style={{ marginBottom: '12px' }}
          >
            {cameraImage ? (
              <img 
                src={cameraImage} 
                alt="Camera Feed" 
                style={{ 
                  width: '100%', 
                  height: '200px', 
                  objectFit: 'cover',
                  borderRadius: '4px'
                }}
              />
            ) : (
              <div style={{ 
                height: '200px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                backgroundColor: '#f5f5f5',
                borderRadius: '4px'
              }}>
                <span style={{ color: '#999' }}>等待相机数据...</span>
              </div>
            )}
          </Card>

          {/* 障碍物检测 */}
          <Card title="障碍物检测" size="small" bodyStyle={{ padding: '12px' }}>
            {obstacleStatus ? (
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Alert
                  title={
                    <Space>
                      {obstacleStatus.status === 'CLEAR' ? (
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      ) : (
                        <WarningOutlined style={{ color: '#ff4d4f' }} />
                      )}
                      <span style={{ fontSize: '12px' }}>{obstacleStatus.message}</span>
                    </Space>
                  }
                  type={obstacleStatus.status === 'CLEAR' ? 'success' : 'warning'}
                  showIcon={false}
                  style={{ marginBottom: '8px' }}
                />

                <Row gutter={8}>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title={<span style={{ fontSize: '12px' }}>激光雷达</span>}
                        value={obstacleStatus.laser_detected ? '检测到' : '正常'}
                        valueStyle={{ 
                          fontSize: '12px',
                          color: obstacleStatus.laser_detected ? '#ff4d4f' : '#52c41a',
                        }}
                      />
                      {obstacleStatus.closest_laser_distance && (
                        <p style={{ marginTop: 4, fontSize: '11px' }}>
                          距离: {obstacleStatus.closest_laser_distance.toFixed(2)}m
                        </p>
                      )}
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title={<span style={{ fontSize: '12px' }}>深度相机</span>}
                        value={obstacleStatus.camera_detected ? '检测到' : '正常'}
                        valueStyle={{ 
                          fontSize: '12px',
                          color: obstacleStatus.camera_detected ? '#ff4d4f' : '#52c41a',
                        }}
                      />
                      {obstacleStatus.closest_depth_distance && (
                        <p style={{ marginTop: 4, fontSize: '11px' }}>
                          距离: {obstacleStatus.closest_depth_distance.toFixed(2)}m
                        </p>
                      )}
                    </Card>
                  </Col>
                </Row>

                <div style={{ fontSize: '11px', color: '#999' }}>
                  建议: {obstacleStatus.action === 'continue' ? '继续' : 
                        obstacleStatus.action === 'slow' ? '减速' : '停止'}
                </div>
              </Space>
            ) : (
              <Alert
                message="无检测数据"
                description="障碍物检测系统未启动"
                type="info"
                showIcon
                style={{ fontSize: '12px' }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* 底部图表 */}
      <Row gutter={[12, 12]} style={{ marginTop: '12px' }}>
        <Col xs={24} lg={12}>
          <Card title="电池监控" size="small" bodyStyle={{ padding: '12px' }}>
            <Suspense fallback={<Loading type="skeleton" rows={4} />}>
              <div style={{ height: '200px', width: '100%' }}>
                <ReactECharts
                  ref={batteryChartRef}
                  option={{
                    tooltip: {
                      trigger: 'axis',
                      formatter: '{b}: {c}%',
                    },
                    xAxis: {
                      type: 'category',
                      data: Array.from({ length: 15 }, (_, i) => `${i}s`),
                      boundaryGap: false,
                      axisLabel: { fontSize: 10 }
                    },
                    yAxis: {
                      type: 'value',
                      min: 0,
                      max: 100,
                      axisLabel: { formatter: '{value}%', fontSize: 10 }
                    },
                    series: [
                      {
                        name: '电池电量',
                        type: 'line',
                        data: Array.from({ length: 15 }, () => batteryLevel + Math.random() * 3 - 1.5),
                        smooth: true,
                        itemStyle: { color: '#52c41a' },
                        lineStyle: { width: 2 }
                      },
                    ],
                    grid: {
                      left: '10%',
                      right: '5%',
                      bottom: '15%',
                      containLabel: true,
                    },
                  }}
                  style={{ height: '100%', width: '100%' }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>
            </Suspense>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="水位监控" size="small" bodyStyle={{ padding: '12px' }}>
            <Suspense fallback={<Loading type="skeleton" rows={4} />}>
              <div style={{ height: '200px', width: '100%' }}>
                <ReactECharts
                  ref={waterChartRef}
                  option={{
                    tooltip: {
                      trigger: 'axis',
                      formatter: '{b}: {c}%',
                    },
                    xAxis: {
                      type: 'category',
                      data: Array.from({ length: 15 }, (_, i) => `${i}s`),
                      boundaryGap: false,
                      axisLabel: { fontSize: 10 }
                    },
                    yAxis: {
                      type: 'value',
                      min: 0,
                      max: 100,
                      axisLabel: { formatter: '{value}%', fontSize: 10 }
                    },
                    series: [
                      {
                        name: '水位',
                        type: 'line',
                        data: Array.from({ length: 15 }, () => waterLevel + Math.random() * 3 - 1.5),
                        smooth: true,
                        itemStyle: { color: '#1890ff' },
                        lineStyle: { width: 2 }
                      },
                    ],
                    grid: {
                      left: '10%',
                      right: '5%',
                      bottom: '15%',
                      containLabel: true,
                    },
                  }}
                  style={{ height: '100%', width: '100%' }}
                  notMerge={true}
                  lazyUpdate={true}
                />
              </div>
            </Suspense>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default StatusMonitor;
