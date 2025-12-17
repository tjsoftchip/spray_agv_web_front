import React, { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { Card, Row, Col, Statistic, Progress, Tag } from 'antd';
import { ThunderboltOutlined, DashboardOutlined, DropboxOutlined } from '@ant-design/icons';
import MapViewer from '../components/MapViewer';
import Loading from '../components/Loading';
import { socketService } from '../services/socket';

const ReactECharts = lazy(() => import('echarts-for-react'));

const RealTimeMonitor: React.FC = () => {
  const [robotPosition, setRobotPosition] = useState({ x: 0, y: 0 });
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [waterLevel, setWaterLevel] = useState(70);
  const [speed, setSpeed] = useState(0);
  const [taskStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const socketConnectedRef = useRef(false);
  const speedHistoryRef = useRef<number[]>([]); // 速度历史记录
  const lastValidSpeedRef = useRef(0); // 上次有效速度
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
    // 连接Socket服务
    socketService.connect();
    socketConnectedRef.current = true;

    // 订阅odom_raw话题获取真实速度（避免EKF滤波器的噪声）
    const subscribeToOdom = () => {
      socketService.sendRosCommand({
        op: 'subscribe',
        topic: '/odom_raw',
        type: 'nav_msgs/Odometry'
      });
    };

    // 监听ROS消息
    const handleRosMessage = (data: any) => {
      if (data.topic === '/odom_raw' && data.msg) {
        // 从odom消息中提取速度信息
        const linearVel = data.msg.twist?.twist?.linear?.x || 0;
        const angularVel = data.msg.twist?.twist?.angular?.z || 0;
        
        // 计算合速度 (线速度的绝对值)
        const rawSpeed = Math.abs(linearVel);
        const filteredSpeed = filterSpeed(rawSpeed);
        setSpeed(filteredSpeed);

        // 更新机器人位置
        const position = data.msg.pose?.pose?.position;
        if (position) {
          setRobotPosition({
            x: position.x || 0,
            y: position.y || 0
          });
        }
        
        // 添加调试日志
        console.log('Odom data received:', {
          linearVel,
          angularVel,
          rawSpeed,
          filteredSpeed,
          position: position ? { x: position.x, y: position.y } : null
        });
      }
    };

    socketService.onRosMessage(handleRosMessage);
    subscribeToOdom();

    const interval = setInterval(() => {
      setBatteryLevel((prev) => Math.max(0, prev - 0.1));
      setWaterLevel((prev) => Math.max(0, prev - 0.15));
    }, 1000);

    return () => {
      clearInterval(interval);
      
      // 安全地清理 ECharts 实例
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
        // 取消订阅odom_raw话题
        socketService.sendRosCommand({
          op: 'unsubscribe',
          topic: '/odom_raw'
        });
        socketService.disconnect();
        socketConnectedRef.current = false;
      }
    };
  }, []);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      idle: 'default',
      running: 'processing',
      paused: 'warning',
    };
    return colors[status] || 'default';
  };

  const getStatusText = (status: string) => {
    const texts: Record<string, string> = {
      idle: '空闲',
      running: '运行中',
      paused: '已暂停',
    };
    return texts[status] || status;
  };

  // 速度滤波函数：死区滤波 + 移动平均
  const filterSpeed = (rawSpeed: number): number => {
    const DEADZONE_THRESHOLD = 0.02; // 死区阈值：小于0.02m/s认为是噪声
    const HISTORY_SIZE = 5; // 移动平均窗口大小
    
    // 死区滤波：小于阈值的速度认为是噪声
    if (Math.abs(rawSpeed) < DEADZONE_THRESHOLD) {
      return 0;
    }
    
    // 移动平均滤波
    speedHistoryRef.current.push(rawSpeed);
    if (speedHistoryRef.current.length > HISTORY_SIZE) {
      speedHistoryRef.current.shift();
    }
    
    const avgSpeed = speedHistoryRef.current.reduce((sum, s) => sum + s, 0) / speedHistoryRef.current.length;
    
    // 如果平均速度小于阈值，返回0
    if (Math.abs(avgSpeed) < DEADZONE_THRESHOLD) {
      return 0;
    }
    
    return avgSpeed;
  };

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="电池电量"
              value={batteryLevel}
              suffix="%"
              prefix={<ThunderboltOutlined />}
              styles={{ content: { color: batteryLevel > 20 ? '#3f8600' : '#cf1322' } }}
            />
            <Progress percent={batteryLevel} status={batteryLevel > 20 ? 'active' : 'exception'} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="水位"
              value={waterLevel}
              suffix="%"
              prefix={<DropboxOutlined />}
              styles={{ content: { color: waterLevel > 10 ? '#3f8600' : '#cf1322' } }}
            />
            <Progress percent={waterLevel} status={waterLevel > 10 ? 'active' : 'exception'} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="当前速度"
              value={speed}
              suffix="m/s"
              prefix={<DashboardOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <div style={{ marginBottom: 8 }}>
              <strong>任务状态</strong>
            </div>
            <Tag color={getStatusColor(taskStatus)} style={{ fontSize: 16, padding: '4px 12px' }}>
              {getStatusText(taskStatus)}
            </Tag>
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card>
            <Statistic
              title="机器人位置"
              value={`(${robotPosition.x.toFixed(5)}, ${robotPosition.y.toFixed(5)})`}
            />
          </Card>
        </Col>
      </Row>

      <Card title="实时位置监控" style={{ marginTop: 16 }}>
        <MapViewer
          navigationPoints={mockNavigationPoints}
          roadSegments={mockRoadSegments}
          robotPosition={robotPosition}
          center={[robotPosition.y, robotPosition.x]}
          zoom={16}
        />
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={12}>
          <Card title="电池电量监控">
            <Suspense fallback={<Loading type="skeleton" rows={6} />}>
              <div style={{ height: '300px', width: '100%' }}>
                <ReactECharts
                  ref={batteryChartRef}
                  option={{
                    tooltip: {
                      trigger: 'axis',
                      formatter: '{b}: {c}%',
                    },
                    xAxis: {
                      type: 'category',
                      data: Array.from({ length: 20 }, (_, i) => `${i}s`),
                      boundaryGap: false,
                    },
                    yAxis: {
                      type: 'value',
                      min: 0,
                      max: 100,
                      axisLabel: {
                        formatter: '{value}%',
                      },
                    },
                    series: [
                      {
                        name: '电池电量',
                        type: 'line',
                        data: Array.from({ length: 20 }, () => batteryLevel + Math.random() * 5 - 2.5),
                        smooth: true,
                        itemStyle: {
                          color: '#52c41a',
                        },
                        areaStyle: {
                          color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                              { offset: 0, color: 'rgba(82, 196, 26, 0.3)' },
                              { offset: 1, color: 'rgba(82, 196, 26, 0.05)' },
                            ],
                          },
                        },
                      },
                    ],
                    grid: {
                      left: '3%',
                      right: '4%',
                      bottom: '3%',
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
          <Card title="水位监控">
            <Suspense fallback={<Loading type="skeleton" rows={6} />}>
<div style={{ height: '300px', width: '100%' }}>
                <ReactECharts
                  ref={waterChartRef}
                  option={{
                    tooltip: {
                      trigger: 'axis',
                      formatter: '{b}: {c}%',
                    },
                    xAxis: {
                      type: 'category',
                      data: Array.from({ length: 20 }, (_, i) => `${i}s`),
                      boundaryGap: false,
                    },
                    yAxis: {
                      type: 'value',
                      min: 0,
                      max: 100,
                      axisLabel: {
                        formatter: '{value}%',
                      },
                    },
                    series: [
                      {
                        name: '水位',
                        type: 'line',
                        data: Array.from({ length: 20 }, () => waterLevel + Math.random() * 5 - 2.5),
                        smooth: true,
                        itemStyle: {
                          color: '#1890ff',
                        },
                        areaStyle: {
                          color: {
                            type: 'linear',
                            x: 0,
                            y: 0,
                            x2: 0,
                            y2: 1,
                            colorStops: [
                              { offset: 0, color: 'rgba(24, 144, 255, 0.3)' },
                              { offset: 1, color: 'rgba(24, 144, 255, 0.05)' },
                            ],
                          },
                        },
                      },
                    ],
                    grid: {
                      left: '3%',
                      right: '4%',
                      bottom: '3%',
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

export default RealTimeMonitor;
