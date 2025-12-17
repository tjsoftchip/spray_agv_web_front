import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Progress, Tag, Button, Space, Statistic, Alert } from 'antd';
import { PlayCircleOutlined, PauseOutlined, StopOutlined, WarningOutlined, CheckCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { navigationApi, obstacleApi } from '../services/navigationApi';
import type { NavigationStatus, ObstacleStatus } from '../services/navigationApi';
import { socketService } from '../services/socket';

const NavigationMonitor: React.FC = () => {
  const navigate = useNavigate();
  const [navigationStatus, setNavigationStatus] = useState<NavigationStatus | null>(null);
  const [obstacleStatus, setObstacleStatus] = useState<ObstacleStatus | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    socketService.connect();

    const handleNavigationStatus = (data: NavigationStatus) => {
      setNavigationStatus(data);
    };

    const handleObstacleStatus = (data: ObstacleStatus) => {
      setObstacleStatus(data);
    };

    socketService.on('navigation_status', handleNavigationStatus);
    socketService.on('obstacle_status', handleObstacleStatus);

    loadInitialData();

    return () => {
      socketService.off('navigation_status', handleNavigationStatus);
      socketService.off('obstacle_status', handleObstacleStatus);
      socketService.disconnect();
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
    setLoading(true);
    try {
      await navigationApi.pauseNavigation(navigationStatus.taskId);
    } catch (error) {
      console.error('Failed to pause navigation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    if (!navigationStatus) return;
    setLoading(true);
    try {
      await navigationApi.resumeNavigation(navigationStatus.taskId);
    } catch (error) {
      console.error('Failed to resume navigation:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    if (!navigationStatus) return;
    setLoading(true);
    try {
      await navigationApi.stopNavigation(navigationStatus.taskId);
    } catch (error) {
      console.error('Failed to stop navigation:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: any = {
      pending: 'default',
      running: 'processing',
      paused: 'warning',
      completed: 'success',
      failed: 'error',
    };
    return colors[status] || 'default';
  };

  const getObstacleColor = (status: string) => {
    const colors: any = {
      CLEAR: 'success',
      CAUTION: 'warning',
      WARNING: 'warning',
      CONFIRMED: 'error',
      UNKNOWN: 'default',
    };
    return colors[status] || 'default';
  };

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <Button 
          icon={<ArrowLeftOutlined />} 
          onClick={() => navigate('/tasks')}
        >
          返回列表
        </Button>
        <h2 style={{ margin: 0 }}>导航实时监控</h2>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="导航状态" variant="borderless">
            {navigationStatus ? (
              <>
                <Space orientation="vertical" style={{ width: '100%' }} size="large">
                  <div>
                    <Tag color={getStatusColor(navigationStatus.status)}>
                      {navigationStatus.status}
                    </Tag>
                    <span style={{ marginLeft: 8 }}>
                      任务ID: {navigationStatus.taskId}
                    </span>
                  </div>

                  <Progress
                    percent={navigationStatus.progress}
                    status={navigationStatus.status === 'running' ? 'active' : 'normal'}
                  />

                  <Row gutter={16}>
                    <Col span={12}>
                      <Statistic
                        title="当前点位"
                        value={navigationStatus.currentIndex + 1}
                        suffix={`/ ${navigationStatus.totalPoints}`}
                      />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="进度"
                        value={navigationStatus.progress}
                        suffix="%"
                      />
                    </Col>
                  </Row>

                  {navigationStatus.currentPoint && (
                    <Card size="small" title="当前目标点">
                      <p><strong>名称:</strong> {navigationStatus.currentPoint.pointName}</p>
                      <p>
                        <strong>位置:</strong> 
                        ({navigationStatus.currentPoint.position.x.toFixed(2)}, 
                        {navigationStatus.currentPoint.position.y.toFixed(2)})
                      </p>
                      <p>
                        <strong>状态:</strong> 
                        <Tag>{navigationStatus.currentPoint.status}</Tag>
                      </p>
                    </Card>
                  )}

                  <Space>
                    {navigationStatus.status === 'running' && (
                      <Button
                        icon={<PauseOutlined />}
                        onClick={handlePause}
                        loading={loading}
                      >
                        暂停
                      </Button>
                    )}
                    {navigationStatus.status === 'paused' && (
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={handleResume}
                        loading={loading}
                      >
                        恢复
                      </Button>
                    )}
                    {(navigationStatus.status === 'running' || navigationStatus.status === 'paused') && (
                      <Button
                        danger
                        icon={<StopOutlined />}
                        onClick={handleStop}
                        loading={loading}
                      >
                        停止
                      </Button>
                    )}
                  </Space>
                </Space>
              </>
            ) : (
              <Alert
                description="当前没有正在执行的导航任务"
                type="info"
                showIcon
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="障碍物检测" variant="borderless">
            {obstacleStatus ? (
              <Space orientation="vertical" style={{ width: '100%' }} size="large">
                <Alert
                  title={
                    <Space>
                      {obstacleStatus.status === 'CLEAR' ? (
                        <CheckCircleOutlined style={{ color: '#52c41a' }} />
                      ) : (
                        <WarningOutlined style={{ color: '#ff4d4f' }} />
                      )}
                      <span>{obstacleStatus.message}</span>
                    </Space>
                  }
                  type={obstacleStatus.status === 'CLEAR' ? 'success' : 'warning'}
                  showIcon={false}
                />

                <Row gutter={16}>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title="激光雷达"
                        value={obstacleStatus.laser_detected ? '检测到' : '正常'}
                        styles={{
                          content: {
                            color: obstacleStatus.laser_detected ? '#ff4d4f' : '#52c41a',
                          }
                        }}
                      />
                      {obstacleStatus.closest_laser_distance && (
                        <p style={{ marginTop: 8 }}>
                          距离: {obstacleStatus.closest_laser_distance.toFixed(2)}m
                        </p>
                      )}
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <Statistic
                        title="深度相机"
                        value={obstacleStatus.camera_detected ? '检测到' : '正常'}
                        styles={{
                          content: {
                            color: obstacleStatus.camera_detected ? '#ff4d4f' : '#52c41a',
                          }
                        }}
                      />
                      {obstacleStatus.closest_depth_distance && (
                        <p style={{ marginTop: 8 }}>
                          距离: {obstacleStatus.closest_depth_distance.toFixed(2)}m
                        </p>
                      )}
                    </Card>
                  </Col>
                </Row>

                <Card size="small">
                  <p>
                    <strong>检测状态:</strong> 
                    <Tag color={getObstacleColor(obstacleStatus.status)} style={{ marginLeft: 8 }}>
                      {obstacleStatus.status}
                    </Tag>
                  </p>
                  <p>
                    <strong>建议动作:</strong> 
                    <Tag style={{ marginLeft: 8 }}>
                      {obstacleStatus.action === 'continue' ? '继续' : 
                       obstacleStatus.action === 'slow' ? '减速' : '停止'}
                    </Tag>
                  </p>
                  <p style={{ fontSize: '12px', color: '#999', marginTop: 8 }}>
                    更新时间: {new Date(obstacleStatus.timestamp * 1000).toLocaleTimeString()}
                  </p>
                </Card>
              </Space>
            ) : (
              <Alert
                message="无检测数据"
                description="障碍物检测系统未启动或无数据"
                type="info"
                showIcon
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default NavigationMonitor;
