import React, { useState, useEffect } from 'react';
import { Card, Button, InputNumber, message, Space, Row, Col, Statistic, Alert } from 'antd';
import { EnvironmentOutlined, ReloadOutlined } from '@ant-design/icons';

interface InitialPoseProps {
  onPoseSet?: (pose: { x: number; y: number; theta: number }) => void;
}

const InitialPoseSetter: React.FC<InitialPoseProps> = ({ onPoseSet }) => {
  const [x, setX] = useState<number>(0);
  const [y, setY] = useState<number>(0);
  const [theta, setTheta] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [currentPose, setCurrentPose] = useState<any>(null);
  const [poseStatus, setPoseStatus] = useState<any>(null);

  useEffect(() => {
    loadCurrentPose();
    const interval = setInterval(loadCurrentPose, 2000); // 每2秒更新一次
    return () => clearInterval(interval);
  }, []);

  const loadCurrentPose = async () => {
    try {
      const response = await fetch('/api/templates/initial-pose/status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      setPoseStatus(data);
      
      if (data.currentPose) {
        setCurrentPose(data.currentPose);
        setX(data.currentPose.position.x);
        setY(data.currentPose.position.y);
        setTheta(data.currentPose.orientation.theta);
      }
    } catch (error) {
      console.error('Failed to load current pose:', error);
    }
  };

  const handleSetInitialPose = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/templates/initial-pose', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ x, y, theta })
      });

      const data = await response.json();
      
      if (response.ok) {
        message.success(data.message);
        onPoseSet?.({ x, y, theta });
        loadCurrentPose(); // 重新加载状态
      } else {
        message.error(data.error || '设置初始位置失败');
      }
    } catch (error) {
      console.error('Set initial pose error:', error);
      message.error('设置初始位置失败');
    } finally {
      setLoading(false);
    }
  };

  const handleGetCurrentPosition = async () => {
    try {
      const response = await fetch('/api/templates/robot/current-position', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      
      if (data.position) {
        setX(data.position.x);
        setY(data.position.y);
        message.success('已获取当前位置');
      }
    } catch (error) {
      console.error('Get current position error:', error);
      message.error('获取当前位置失败');
    }
  };

  const formatTheta = (theta: number) => {
    const degrees = (theta * 180 / Math.PI).toFixed(1);
    return `${degrees}° (${theta.toFixed(3)} rad)`;
  };

  return (
    <Card 
      title="初始位置设置" 
      extra={
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadCurrentPose}
            size="small"
          >
            刷新
          </Button>
          <Button 
            type="primary" 
            onClick={handleSetInitialPose}
            loading={loading}
          >
            设置初始位置
          </Button>
        </Space>
      }
    >
      {poseStatus && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Statistic
              title="定位状态"
              value={poseStatus.initialized ? "已初始化" : "未初始化"}
              valueStyle={{ color: poseStatus.initialized ? '#3f8600' : '#cf1322' }}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="定位来源"
              value={poseStatus.source || '未知'}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="定位可靠性"
              value={poseStatus.reliable ? "可靠" : "不可靠"}
              valueStyle={{ color: poseStatus.reliable ? '#3f8600' : '#cf1322' }}
            />
          </Col>
        </Row>
      )}

      {poseStatus && !poseStatus.initialized && (
        <Alert
          message="机器人未初始化"
          description={poseStatus.message}
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16}>
        <Col span={8}>
          <div style={{ marginBottom: 16 }}>
            <label>X 坐标 (米):</label>
            <InputNumber
              style={{ width: '100%' }}
              value={x}
              onChange={(value) => setX(value || 0)}
              step={0.1}
              precision={3}
              placeholder="输入 X 坐标"
            />
          </div>
        </Col>
        <Col span={8}>
          <div style={{ marginBottom: 16 }}>
            <label>Y 坐标 (米):</label>
            <InputNumber
              style={{ width: '100%' }}
              value={y}
              onChange={(value) => setY(value || 0)}
              step={0.1}
              precision={3}
              placeholder="输入 Y 坐标"
            />
          </div>
        </Col>
        <Col span={8}>
          <div style={{ marginBottom: 16 }}>
            <label>方向角 (弧度):</label>
            <InputNumber
              style={{ width: '100%' }}
              value={theta}
              onChange={(value) => setTheta(value || 0)}
              step={0.1}
              precision={3}
              placeholder="输入方向角"
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
              {formatTheta(theta)}
            </div>
          </div>
        </Col>
      </Row>

      <Space style={{ marginTop: 16 }}>
        <Button 
          icon={<EnvironmentOutlined />} 
          onClick={handleGetCurrentPosition}
        >
          使用当前位置
        </Button>
        <Button onClick={() => setTheta(0)}>朝向 0°</Button>
        <Button onClick={() => setTheta(Math.PI / 2)}>朝向 90°</Button>
        <Button onClick={() => setTheta(Math.PI)}>朝向 180°</Button>
        <Button onClick={() => setTheta(-Math.PI / 2)}>朝向 -90°</Button>
      </Space>

      {currentPose && (
        <Card 
          size="small" 
          title="当前机器人位姿" 
          style={{ marginTop: 16 }}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Statistic
                title="X 坐标"
                value={currentPose.position.x}
                precision={3}
                suffix="m"
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="Y 坐标"
                value={currentPose.position.y}
                precision={3}
                suffix="m"
              />
            </Col>
            <Col span={8}>
              <Statistic
                title="方向角"
                value={currentPose.orientation.degrees}
                precision={1}
                suffix="°"
              />
            </Col>
          </Row>
        </Card>
      )}
    </Card>
  );
};

export default InitialPoseSetter;