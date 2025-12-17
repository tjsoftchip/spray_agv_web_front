import React, { useState, useEffect, useRef } from 'react';
import { Card, Row, Col, Switch, Slider, Button, Space, message, Tag, InputNumber } from 'antd';
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
  const [isMoving, setIsMoving] = useState(false);
  const velocityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [maxSpeed, setMaxSpeed] = useState(1.0); // 默认最大速度1.0m/s

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
      // 清理定时器
      if (velocityIntervalRef.current) {
        clearInterval(velocityIntervalRef.current);
      }
    };
  }, []);

  // 监听控制模式变化，切换到自动模式时停止运动
  useEffect(() => {
    socketService.connect();
    
    // 声明 /web_cmd_vel 话题，确保可以发布
    socketService.sendRosCommand({
      op: 'advertise',
      topic: '/web_cmd_vel',
      type: 'geometry_msgs/msg/Twist'
    });
    
    return () => {
      if (controlMode === 'manual') {
        stopVelocityPublishing();
      }
      
      // 取消话题声明
      socketService.sendRosCommand({
        op: 'unadvertise',
        topic: '/web_cmd_vel'
      });
      
      socketService.disconnect();
    };
  }, [controlMode]);

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
    // 停止所有运动
    stopVelocityPublishing();
    setVelocity({ linear: 0, angular: 0 });
    
    // 停止喷淋设备
    setPumpStatus(false);
    setLeftValveStatus(false);
    setRightValveStatus(false);
    publishRosCommand('/spray/pump_control', 'std_msgs/Bool', { data: false });
    publishRosCommand('/spray/left_valve_control', 'std_msgs/Bool', { data: false });
    publishRosCommand('/spray/right_valve_control', 'std_msgs/Bool', { data: false });
    
    // 发送停止命令
    const stopMessage = {
      linear: { x: 0.0, y: 0.0, z: 0.0 },
      angular: { x: 0.0, y: 0.0, z: 0.0 }
    };
    publishRosCommand('/web_cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
    publishRosCommand('/cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
    
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

  const startVelocityPublishing = (linear: number, angular: number) => {
    // 清除之前的定时器
    if (velocityIntervalRef.current) {
      clearInterval(velocityIntervalRef.current);
    }
    
    setIsMoving(true);
    
    // 立即发送一次
    const twistMessage = {
      linear: { x: linear, y: 0.0, z: 0.0 },
      angular: { x: 0.0, y: 0.0, z: angular }
    };
    console.log('Sending twist message:', twistMessage);
    // 使用专门的web_cmd_vel话题，避免与手柄控制冲突
    publishRosCommand('/web_cmd_vel', 'geometry_msgs/msg/Twist', twistMessage);
    // 同时也发送到原话题，尝试覆盖
    publishRosCommand('/cmd_vel', 'geometry_msgs/msg/Twist', twistMessage);
    
    // 设置定时器，提高发送频率到50ms，以覆盖其他节点的命令
    velocityIntervalRef.current = setInterval(() => {
      console.log('Continuously sending twist message:', twistMessage);
      publishRosCommand('/cmd_vel', 'geometry_msgs/msg/Twist', twistMessage);
    }, 50);
  };

  const stopVelocityPublishing = () => {
    console.log('Stopping velocity publishing');
    setIsMoving(false);
    
    // 清除定时器
    if (velocityIntervalRef.current) {
      clearInterval(velocityIntervalRef.current);
      velocityIntervalRef.current = null;
    }
    
    // 发送停止命令
    const stopMessage = {
      linear: { x: 0.0, y: 0.0, z: 0.0 },
      angular: { x: 0.0, y: 0.0, z: 0.0 }
    };
    console.log('Sending stop message:', stopMessage);
    publishRosCommand('/web_cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
    publishRosCommand('/cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
  };

  const handleJoystickMove = (event: any) => {
    if (controlMode !== 'manual') return;
    
    // 使用设定的最大速度值
    const maxLinear = maxSpeed;  // 线速度最大值
    const maxAngular = maxSpeed; // 角速度最大值
    
    // react-joystick-component 返回的值范围是 -1 到 1
    const joystickX = event.x || 0;
    const joystickY = event.y || 0;
    
    // 直接使用摇杆值乘以最大速度
    const linear = joystickY * maxLinear;
    const angular = -joystickX * maxAngular;
    
    console.log('Joystick move:', { x: joystickX, y: joystickY, linear, angular });
    
    setVelocity({ linear, angular });
    
    // 如果摇杆回到中心位置（接近0），则停止
    if (Math.abs(joystickX) < 0.1 && Math.abs(joystickY) < 0.1) {
      console.log('Joystick returned to center, stopping');
      handleJoystickStop();
    } else {
      // 开始持续发送速度命令
      startVelocityPublishing(linear, angular);
    }
  };

  const handleJoystickStop = () => {
    console.log('Joystick stop');
    setVelocity({ linear: 0, angular: 0 });
    
    // 停止发送速度命令
    stopVelocityPublishing();
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
                  throttle={50}
                  options={{
                    mode: 'static',
                    position: { x: '50%', y: '50%' },
                    color: '#1890ff'
                  }}
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
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', marginBottom: 8 }}>最大移动速度 (m/s):</label>
                  <InputNumber
                    min={0.1}
                    max={3.0}
                    step={0.1}
                    value={maxSpeed}
                    onChange={(value) => {
                      if (value) {
                        setMaxSpeed(value);
                        message.info(`最大速度已设置为 ${value} m/s`);
                      }
                    }}
                    style={{ width: '100%' }}
                  />
                </div>
                <Button 
                  danger 
                  size="large" 
                  block 
                  onClick={handleEmergencyStop}
                  style={{ marginTop: 10 }}
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
              <Card title="水泵控制" variant="borderless">
                <Space orientation="vertical" style={{ width: '100%' }}>
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
              <Card title="支架高度" variant="borderless">
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
              <Card title="左侧展臂控制" variant="borderless">
                <Space orientation="vertical" style={{ width: '100%' }}>
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
              <Card title="右侧展臂控制" variant="borderless">
                <Space orientation="vertical" style={{ width: '100%' }}>
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
            <Card title="实时监控" variant="borderless" style={{ height: '100%' }}>
              <Space orientation="vertical" style={{ width: '100%' }} size="large">
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
