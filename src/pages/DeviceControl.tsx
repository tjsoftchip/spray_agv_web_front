import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Switch, Slider, Button, Space, message, Tag } from 'antd';
import { Joystick } from 'react-joystick-component';
import { socketService } from '../services/socket';
import { useOrientation } from '../hooks/useOrientation';

const DeviceControl: React.FC = () => {
  const orientation = useOrientation();
  const [pumpStatus, setPumpStatus] = useState(false);
  const [leftArmStatus, setLeftArmStatus] = useState('close');
  const [rightArmStatus, setRightArmStatus] = useState('close');
  const [leftValveStatus, setLeftValveStatus] = useState(false);
  const [rightValveStatus, setRightValveStatus] = useState(false);
  const [armHeight, setArmHeight] = useState(1.0);
  const [controlMode, setControlMode] = useState<'auto' | 'manual'>('auto');
  const [velocity, setVelocity] = useState({ linear: 0, angular: 0 });

  useEffect(() => {
    socketService.connect();

    socketService.on('ros_message', (data) => {
      if (data.topic === '/spray_status') {
        const status = JSON.parse(data.msg.data);
        setPumpStatus(status.pump_status);
        setLeftArmStatus(status.left_arm_status);
        setRightArmStatus(status.right_arm_status);
        setLeftValveStatus(status.left_valve_status);
        setRightValveStatus(status.right_valve_status);
        setArmHeight(status.arm_height);
      }
    });

    return () => {
      socketService.off('ros_message');
    };
  }, []);

  const publishRosCommand = (topic: string, msgType: string, msg: any) => {
    socketService.sendRosCommand({
      op: 'publish',
      topic,
      msg,
      type: msgType,
    });
  };

  const handlePumpToggle = (checked: boolean) => {
    setPumpStatus(checked);
    publishRosCommand('/spray/pump_control', 'std_msgs/Bool', { data: checked });
    message.success(`水泵已${checked ? '开启' : '关闭'}`);
  };

  const handleArmControl = (side: 'left' | 'right', status: string) => {
    if (side === 'left') {
      setLeftArmStatus(status);
      publishRosCommand('/spray/left_arm_control', 'std_msgs/String', { data: status });
    } else {
      setRightArmStatus(status);
      publishRosCommand('/spray/right_arm_control', 'std_msgs/String', { data: status });
    }
    message.success(`${side === 'left' ? '左侧' : '右侧'}展臂${status === 'open' ? '打开' : '关闭'}`);
  };

  const handleValveToggle = (side: 'left' | 'right', checked: boolean) => {
    if (side === 'left') {
      setLeftValveStatus(checked);
      publishRosCommand('/spray/left_valve_control', 'std_msgs/Bool', { data: checked });
    } else {
      setRightValveStatus(checked);
      publishRosCommand('/spray/right_valve_control', 'std_msgs/Bool', { data: checked });
    }
    message.success(`${side === 'left' ? '左侧' : '右侧'}水阀已${checked ? '开启' : '关闭'}`);
  };

  const handleHeightChange = (value: number) => {
    setArmHeight(value);
    publishRosCommand('/spray/height_control', 'std_msgs/Float32', { data: value });
  };

  const handleEmergencyStop = () => {
    setPumpStatus(false);
    setLeftValveStatus(false);
    setRightValveStatus(false);
    publishRosCommand('/spray/pump_control', 'std_msgs/Bool', { data: false });
    publishRosCommand('/spray/left_valve_control', 'std_msgs/Bool', { data: false });
    publishRosCommand('/spray/right_valve_control', 'std_msgs/Bool', { data: false });
    setVelocity({ linear: 0, angular: 0 });
    message.warning('紧急停止已触发');
  };

  const handleModeSwitch = (mode: 'auto' | 'manual') => {
    setControlMode(mode);
    if (mode === 'manual') {
      message.info('已切换到手动控制模式');
    } else {
      handleEmergencyStop();
      message.info('已切换到自动控制模式');
    }
  };

  const handleJoystickMove = (event: any) => {
    if (controlMode !== 'manual') return;
    
    const maxLinear = 0.5;
    const maxAngular = 1.0;
    
    const linear = (event.y || 0) * maxLinear / 100;
    const angular = -(event.x || 0) * maxAngular / 100;
    
    setVelocity({ linear, angular });
    
    publishRosCommand('/cmd_vel', 'geometry_msgs/Twist', {
      linear: { x: linear, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angular },
    });
  };

  const handleJoystickStop = () => {
    setVelocity({ linear: 0, angular: 0 });
    publishRosCommand('/cmd_vel', 'geometry_msgs/Twist', {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    });
  };

  return (
    <div>
      <Card 
        title="控制模式" 
        style={{ marginBottom: 16 }}
        extra={
          <Tag color={controlMode === 'auto' ? 'green' : 'orange'}>
            {controlMode === 'auto' ? '自动模式' : '手动模式'}
          </Tag>
        }
      >
        <Space size="large">
          <Button 
            type={controlMode === 'auto' ? 'primary' : 'default'}
            onClick={() => handleModeSwitch('auto')}
          >
            自动控制
          </Button>
          <Button 
            type={controlMode === 'manual' ? 'primary' : 'default'}
            onClick={() => handleModeSwitch('manual')}
          >
            手动控制
          </Button>
        </Space>
      </Card>

      {controlMode === 'manual' && (
        <Card title="虚拟摇杆" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                padding: '20px'
              }}>
                <Joystick
                  size={150}
                  baseColor="#d0d0d0"
                  stickColor="#1890ff"
                  move={handleJoystickMove}
                  stop={handleJoystickStop}
                />
                <div style={{ marginTop: 20, textAlign: 'center' }}>
                  <p>线速度: {velocity.linear.toFixed(2)} m/s</p>
                  <p>角速度: {velocity.angular.toFixed(2)} rad/s</p>
                </div>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ padding: '20px' }}>
                <h4>操作说明：</h4>
                <ul>
                  <li>向上推动摇杆：前进</li>
                  <li>向下推动摇杆：后退</li>
                  <li>向左推动摇杆：左转</li>
                  <li>向右推动摇杆：右转</li>
                  <li>松开摇杆：停止</li>
                </ul>
                <Button 
                  danger 
                  size="large" 
                  block 
                  onClick={handleEmergencyStop}
                  style={{ marginTop: 20 }}
                >
                  紧急停止
                </Button>
              </div>
            </Col>
          </Row>
        </Card>
      )}

      <h2>设备控制</h2>

      <div className={orientation === 'landscape' ? 'control-panel-landscape' : 'layout-portrait'}>
        <div className={orientation === 'landscape' ? '' : ''}>
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={orientation === 'landscape' ? 24 : 12}>
              <Card title="水泵控制" bordered={false}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px' }}>水泵状态</span>
                    <Switch
                      checked={pumpStatus}
                      onChange={handlePumpToggle}
                      checkedChildren="开"
                      unCheckedChildren="关"
                      size="default"
                    />
                  </div>
                </Space>
              </Card>
            </Col>

            <Col xs={24} lg={orientation === 'landscape' ? 24 : 12}>
              <Card title="支架高度" bordered={false}>
                <div>
                  <div style={{ marginBottom: 16 }}>
                    <span style={{ fontSize: '16px' }}>当前高度: {armHeight.toFixed(2)} 米</span>
                  </div>
                  <Slider
                    min={0.5}
                    max={2.5}
                    step={0.1}
                    value={armHeight}
                    onChange={handleHeightChange}
                    marks={{
                      0.5: '0.5m',
                      1.0: '1.0m',
                      1.5: '1.5m',
                      2.0: '2.0m',
                      2.5: '2.5m',
                    }}
                  />
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={orientation === 'landscape' ? 24 : 12}>
              <Card title="左侧展臂控制" bordered={false}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>展臂状态: {leftArmStatus === 'open' ? '打开' : '关闭'}</span>
                    <Space>
                      <Button
                        type={leftArmStatus === 'open' ? 'primary' : 'default'}
                        onClick={() => handleArmControl('left', 'open')}
                      >
                        打开
                      </Button>
                      <Button
                        type={leftArmStatus === 'close' ? 'primary' : 'default'}
                        onClick={() => handleArmControl('left', 'close')}
                      >
                        关闭
                      </Button>
                    </Space>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                    <span>水阀状态</span>
                    <Switch
                      checked={leftValveStatus}
                      onChange={(checked) => handleValveToggle('left', checked)}
                      checkedChildren="开"
                      unCheckedChildren="关"
                    />
                  </div>
                </Space>
              </Card>
            </Col>

            <Col xs={24} lg={orientation === 'landscape' ? 24 : 12}>
              <Card title="右侧展臂控制" bordered={false}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>展臂状态: {rightArmStatus === 'open' ? '打开' : '关闭'}</span>
                    <Space>
                      <Button
                        type={rightArmStatus === 'open' ? 'primary' : 'default'}
                        onClick={() => handleArmControl('right', 'open')}
                      >
                        打开
                      </Button>
                      <Button
                        type={rightArmStatus === 'close' ? 'primary' : 'default'}
                        onClick={() => handleArmControl('right', 'close')}
                      >
                        关闭
                      </Button>
                    </Space>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                    <span>水阀状态</span>
                    <Switch
                      checked={rightValveStatus}
                      onChange={(checked) => handleValveToggle('right', checked)}
                      checkedChildren="开"
                      unCheckedChildren="关"
                    />
                  </div>
                </Space>
              </Card>
            </Col>
          </Row>
        </div>

        {orientation === 'landscape' && (
          <div>
            <Card title="实时监控" bordered={false} style={{ height: '100%' }}>
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <div>
                  <Tag color="blue">控制模式: {controlMode === 'auto' ? '自动' : '手动'}</Tag>
                  <Tag color={pumpStatus ? 'green' : 'default'}>水泵: {pumpStatus ? '运行' : '停止'}</Tag>
                </div>
                <div>
                  <div style={{ marginBottom: 8 }}>线速度: {velocity.linear.toFixed(2)} m/s</div>
                  <div>角速度: {velocity.angular.toFixed(2)} rad/s</div>
                </div>
                <div style={{ color: '#999', fontSize: 14 }}>
                  <div>• 实时监控机器人状态</div>
                  <div>• 显示传感器数据</div>
                  <div>• 查看设备运行参数</div>
                </div>
              </Space>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceControl;
