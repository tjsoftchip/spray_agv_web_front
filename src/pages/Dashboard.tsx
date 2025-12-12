import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Card, Row, Col, Statistic, Progress, Badge } from 'antd';
import { 
  RobotOutlined, 
  ThunderboltOutlined, 
  ExperimentOutlined,
  CheckCircleOutlined 
} from '@ant-design/icons';
import { socketService } from '../services/socket';
import Loading from '../components/Loading';

const ReactECharts = lazy(() => import('echarts-for-react'));

const Dashboard: React.FC = () => {
  const [robotStatus] = useState({
    battery: 85,
    waterLevel: 70,
    temperature: 25,
    status: 'idle',
  });

  useEffect(() => {
    socketService.connect();
    
    socketService.onRosMessage((data) => {
      console.log('ROS message:', data);
    });

    return () => {
      socketService.disconnect();
    };
  }, []);

  return (
    <div style={{ padding: '24px' }}>
      <h2>系统概览</h2>
      
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="机器人状态"
              value={robotStatus.status === 'idle' ? '空闲' : '工作中'}
              prefix={<RobotOutlined />}
              valueStyle={{ color: robotStatus.status === 'idle' ? '#3f8600' : '#1890ff' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="电池电量"
              value={robotStatus.battery}
              suffix="%"
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: robotStatus.battery > 20 ? '#3f8600' : '#cf1322' }}
            />
            <Progress 
              percent={robotStatus.battery} 
              strokeColor={robotStatus.battery > 20 ? '#52c41a' : '#ff4d4f'}
              showInfo={false}
              style={{ marginTop: '8px' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="水位"
              value={robotStatus.waterLevel}
              suffix="%"
              prefix={<ExperimentOutlined />}
              valueStyle={{ color: robotStatus.waterLevel > 10 ? '#3f8600' : '#cf1322' }}
            />
            <Progress 
              percent={robotStatus.waterLevel} 
              strokeColor={robotStatus.waterLevel > 10 ? '#1890ff' : '#ff4d4f'}
              showInfo={false}
              style={{ marginTop: '8px' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="温度"
              value={robotStatus.temperature}
              suffix="°C"
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col xs={24} lg={12}>
          <Card title="系统状态">
            <div style={{ padding: '16px 0' }}>
              <div style={{ marginBottom: '16px' }}>
                <Badge status="success" text="底盘系统" />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <Badge status="success" text="导航系统" />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <Badge status="success" text="喷水系统" />
              </div>
              <div>
                <Badge status="warning" text="补给系统 (未连接)" />
              </div>
            </div>
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card title="最近任务">
            <div style={{ padding: '16px 0' }}>
              <p>暂无任务记录</p>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="电池电量趋势">
            <Suspense fallback={<Loading type="skeleton" rows={6} />}>
              <ReactECharts
              option={{
                tooltip: {
                  trigger: 'axis',
                },
                xAxis: {
                  type: 'category',
                  data: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', '24:00'],
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
                    data: [95, 88, 82, 75, 70, 85, 85],
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
              style={{ height: '300px' }}
            />
            </Suspense>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="任务统计">
            <Suspense fallback={<Loading type="skeleton" rows={6} />}>
              <ReactECharts
              option={{
                tooltip: {
                  trigger: 'item',
                  formatter: '{a} <br/>{b}: {c} ({d}%)',
                },
                legend: {
                  orient: 'vertical',
                  left: 'left',
                },
                series: [
                  {
                    name: '任务状态',
                    type: 'pie',
                    radius: ['40%', '70%'],
                    avoidLabelOverlap: false,
                    itemStyle: {
                      borderRadius: 10,
                      borderColor: '#fff',
                      borderWidth: 2,
                    },
                    label: {
                      show: false,
                      position: 'center',
                    },
                    emphasis: {
                      label: {
                        show: true,
                        fontSize: 20,
                        fontWeight: 'bold',
                      },
                    },
                    labelLine: {
                      show: false,
                    },
                    data: [
                      { value: 15, name: '已完成', itemStyle: { color: '#52c41a' } },
                      { value: 3, name: '进行中', itemStyle: { color: '#1890ff' } },
                      { value: 2, name: '待执行', itemStyle: { color: '#faad14' } },
                      { value: 1, name: '失败', itemStyle: { color: '#ff4d4f' } },
                    ],
                  },
                ],
              }}
              style={{ height: '300px' }}
            />
            </Suspense>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;
