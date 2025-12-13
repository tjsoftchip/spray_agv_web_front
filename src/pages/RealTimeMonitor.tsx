import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Card, Row, Col, Statistic, Progress, Tag } from 'antd';
import { ThunderboltOutlined, DashboardOutlined, DropboxOutlined } from '@ant-design/icons';
import MapViewer from '../components/MapViewer';
import Loading from '../components/Loading';

const ReactECharts = lazy(() => import('echarts-for-react'));

const RealTimeMonitor: React.FC = () => {
  const [robotPosition, setRobotPosition] = useState({ x: 0, y: 0 });
  const [batteryLevel, setBatteryLevel] = useState(85);
  const [waterLevel, setWaterLevel] = useState(70);
  const [speed] = useState(0.35);
  const [taskStatus] = useState<'idle' | 'running' | 'paused'>('idle');

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
    const interval = setInterval(() => {
      setRobotPosition((prev) => ({
        x: prev.x + 0.00001,
        y: prev.y + 0.00001,
      }));
      setBatteryLevel((prev) => Math.max(0, prev - 0.1));
      setWaterLevel((prev) => Math.max(0, prev - 0.15));
    }, 1000);

    return () => clearInterval(interval);
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
