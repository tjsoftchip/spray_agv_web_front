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
  const [isJoystickActive, setIsJoystickActive] = useState(true); // 手柄激活状态
  const [isFullControlMode, setIsFullControlMode] = useState(false); // 完全接管模式状态

  const [emergencyStopActive, setEmergencyStopActive] = useState(false); // 紧急停止状态
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
    
    // 声明 /manual/cmd_vel 话题，确保可以发布
    socketService.sendRosCommand({
      op: 'advertise',
      topic: '/manual/cmd_vel',
      type: 'geometry_msgs/msg/Twist'
    });
    
    return () => {
      stopVelocityPublishing();
      
      // 取消话题声明
      socketService.sendRosCommand({
        op: 'unadvertise',
        topic: '/manual/cmd_vel'
      });
      
      socketService.disconnect();
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
    publishRosCommand('/manual/cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
    // 设置紧急停止状态
    setEmergencyStopActive(true);
    publishRosCommand('/emergency/stop', 'std_msgs/Bool', { data: true });
    
    message.warning('紧急停止已触发 - 所有控制已失效');
    
  };

  // 复位紧急停止
  const resetEmergencyStop = () => {
    setEmergencyStopActive(false);
    publishRosCommand('/emergency/stop', 'std_msgs/Bool', { data: false });
    message.success('紧急停止已复位 - 控制权已恢复');
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
    publishRosCommand('/manual/cmd_vel', 'geometry_msgs/msg/Twist', twistMessage);
    
    // 定时发送速度指令，确保持续控制
    velocityIntervalRef.current = setInterval(() => {
      console.log('Continuously sending twist message:', twistMessage);
      publishRosCommand('/manual/cmd_vel', 'geometry_msgs/msg/Twist', twistMessage);
    }, 100); // 每100ms发送一次
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
    publishRosCommand('/manual/cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
  };

  const handleJoystickMove = (event: any) => {
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
    
    // 确保停止命令发送成功，发送多次停止命令
    const stopMessage = {
      linear: { x: 0.0, y: 0.0, z: 0.0 },
      angular: { x: 0.0, y: 0.0, z: 0.0 }
    };
    
    // 立即发送一次停止命令
    publishRosCommand('/manual/cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
    
    // 延迟再发送两次，确保停止命令可靠到达
    setTimeout(() => {
      publishRosCommand('/manual/cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
    }, 50);
    
    setTimeout(() => {
      publishRosCommand('/manual/cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
    }, 100);
  };

  // 切换手柄激活状态
  const toggleJoystickActive = () => {
    setIsJoystickActive(!isJoystickActive);
    if (isJoystickActive) {
      message.warning('手柄控制已禁用');
      // 立即停止所有速度指令
      handleEmergencyStop();
    } else {
      message.success('手柄控制已启用');
    }
  };


  // 切换完全接管模式
  const toggleFullControlMode = () => {
    const newMode = !isFullControlMode;
    setIsFullControlMode(newMode);
    
    // 发布完全接管模式状态到 ROS2（控制遥控器和网页摇杆）
    publishRosCommand('/joystick/full_control_state', 'std_msgs/Bool', { data: newMode });
    publishRosCommand('/manual/full_control_state', 'std_msgs/Bool', { data: newMode });
    
    if (newMode) {
      message.success('完全接管模式已启用 - 网页摇杆获得最高控制权（仅次于遥控器）');
    } else {
      message.info('完全接管模式已禁用 - 恢复默认优先级管理');
    }
  };

  return (
      <div>
        <Card 
          title="虚拟摇杆控制" 
          style={{ 
            marginBottom: 24,
            borderRadius: 12,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
          }}
          styles={{
            header: {
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              borderRadius: '12px 12px 0 0',
              border: 'none'
            }
          }}
        >
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12}>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center',
                padding: '24px',
                background: '#f8f9fa',
                borderRadius: 8
              }}>
                <Joystick
                  size={180}
                  baseColor="#e9ecef"
                  stickColor="#667eea"
                  move={handleJoystickMove}
                  stop={handleJoystickStop}
                  throttle={50}
                  options={{
                    mode: 'static',
                    position: { x: '50%', y: '50%' },
                    color: '#667eea'
                  }}
                />
                <div style={{ 
                  marginTop: 24, 
                  textAlign: 'center',
                  background: 'white',
                  padding: '16px 24px',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  width: '100%'
                }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                    当前速度状态
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-around',
                    color: '#495057'
                  }}>
                    <div>
                      <div style={{ fontSize: 12, color: '#6c757d' }}>线速度</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#667eea' }}>
                        {velocity.linear.toFixed(2)} m/s
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: '#6c757d' }}>角速度</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#764ba2' }}>
                        {velocity.angular.toFixed(2)} rad/s
                      </div>
                    </div>
                  </div>
                </div>

                {/* 完全接管模式切换按键 */}
                <div style={{ 
                  marginTop: 20,
                  textAlign: 'center',
                  background: isFullControlMode ? '#fff3cd' : '#d4edda',
                  padding: '16px 24px',
                  borderRadius: 8,
                  border: `2px solid ${isFullControlMode ? '#ffeeba' : '#c3e6cb'}`,
                  width: '100%'
                }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: isFullControlMode ? '#856404' : '#155724' }}>
                    🎮 完全接管模式
                  </div>
                  <Button
                    type="default"
                    size="large"
                    onClick={toggleFullControlMode}
                    style={{
                      backgroundColor: isFullControlMode ? '#ffc107' : '#28a745',
                      borderColor: isFullControlMode ? '#ffc107' : '#28a745',
                      color: 'white',
                      fontWeight: 600,
                      minWidth: 120,
                      height: 40,
                      borderRadius: 6,
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                    }}
                  >
                    {isFullControlMode ? '⚡ 已启用' : '🟢 已禁用'}
                  </Button>
                  <div style={{ 
                    fontSize: 12, 
                    marginTop: 8,
                    color: isFullControlMode ? '#856404' : '#155724',
                    lineHeight: 1.4
                  }}>
                    {isFullControlMode 
                      ? '网页摇杆获得最高控制权，即使速度为0也保持控制' 
                      : '默认优先级管理，按照优先级规则切换控制源'}
                  </div>
                </div>

              </div>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ padding: '24px' }}>

                {/* 紧急停止复位按钮 */}
                {emergencyStopActive && (
                  <div style={{ 
                    marginTop: 20,
                    textAlign: 'center',
                    background: '#f8d7da',
                    padding: '16px 24px',
                    borderRadius: 8,
                    border: '2px solid #f5c6cb',
                    width: '100%'
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#721c24' }}>
                      🛑 紧急停止已触发
                    </div>
                    <Button
                      type="default"
                      size="large"
                      onClick={resetEmergencyStop}
                      style={{
                        backgroundColor: '#dc3545',
                        borderColor: '#dc3545',
                        color: 'white',
                        fontWeight: 600,
                        minWidth: 120,
                        height: 40,
                        borderRadius: 6,
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
                      }}
                    >
                      🔓 复位控制权
                    </Button>
                    <div style={{ 
                      fontSize: 12, 
                      marginTop: 8,
                      color: '#721c24',
                      lineHeight: 1.4
                    }}>
                      点击复位按钮以恢复所有控制权
                    </div>
                  </div>
                )}

                <div style={{ 
                  marginBottom: 24,
                  background: '#f8f9fa',
                  padding: '16px',
                  borderRadius: 8
                }}>
                  <h4 style={{ 
                    margin: '0 0 12px 0',
                    color: '#495057',
                    fontSize: 16,
                    fontWeight: 600
                  }}>
                    🎮 操作说明
                  </h4>
                  <ul style={{ 
                    margin: 0,
                    paddingLeft: 20,
                    color: '#6c757d',
                    fontSize: 14
                  }}>
                    <li style={{ marginBottom: 8 }}>向上推动摇杆：前进</li>
                    <li style={{ marginBottom: 8 }}>向下推动摇杆：后退</li>
                    <li style={{ marginBottom: 8 }}>向左推动摇杆：左转</li>
                    <li style={{ marginBottom: 8 }}>向右推动摇杆：右转</li>
                    <li>松开摇杆：停止</li>
                  </ul>
                </div>
                
                <div style={{ marginBottom: 24 }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#495057'
                  }}>
                    ⚡ 最大移动速度 (m/s)
                  </label>
                  <InputNumber
                    min={0.1}
                    max={3.0}
                    step={0.1}
                    value={maxSpeed}
                    onChange={(value) => {
                      if (value) {
                        setMaxSpeed(value);
                        message.success(`最大速度已设置为 ${value} m/s`);
                      }
                    }}
                    style={{ 
                      width: '100%',
                      height: 40,
                      borderRadius: 8
                    }}
                  />
                </div>
                
              </div>
            </Col>
          </Row>
        </Card>

      <h2 style={{ 
        marginBottom: 24,
        fontSize: 24,
        fontWeight: 700,
        color: '#2c3e50',
        textAlign: 'center'
      }}>
        🚜 设备控制
      </h2>

      <div style={{ padding: '0 8px' }}>
        <Row gutter={[24, 24]}>
          <Col xs={24} lg={12}>
              <Card 
                title="💧 水泵控制" 
                style={{ 
                  borderRadius: 12,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  border: 'none'
                }}
                styles={{
                  header: {
                    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                    color: 'white',
                    borderRadius: '12px 12px 0 0',
                    border: 'none',
                    fontSize: 16,
                    fontWeight: 600
                  }
                }}
              >
                <div style={{ 
                  padding: '20px 0',
                  background: '#f8f9fa',
                  borderRadius: 8,
                  textAlign: 'center'
                }}>
                  <div style={{ 
                    marginBottom: 16,
                    fontSize: 16,
                    fontWeight: 600,
                    color: '#495057'
                  }}>
                    水泵状态
                  </div>
                  <Switch
                    checked={pumpStatus}
                    onChange={handlePumpToggle}
                    checkedChildren="开"
                    unCheckedChildren="关"
                    size="default"
                    style={{
                      transform: 'scale(1.2)'
                    }}
                  />
                  <div style={{ 
                    marginTop: 12,
                    fontSize: 14,
                    color: pumpStatus ? '#28a745' : '#6c757d',
                    fontWeight: 500
                  }}>
                    {pumpStatus ? '🟢 水泵正在运行' : '🔴 水泵已停止'}
                  </div>
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card 
                title="📏 支架高度" 
                style={{ 
                  borderRadius: 12,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  border: 'none'
                }}
                styles={{
                  header: {
                    background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                    color: 'white',
                    borderRadius: '12px 12px 0 0',
                    border: 'none',
                    fontSize: 16,
                    fontWeight: 600
                  }
                }}
              >
                <div style={{ padding: '20px 0' }}>
                  <div style={{ 
                    marginBottom: 24,
                    textAlign: 'center',
                    background: '#f8f9fa',
                    padding: '16px',
                    borderRadius: 8
                  }}>
                    <div style={{ 
                      fontSize: 14,
                      color: '#6c757d',
                      marginBottom: 8
                    }}>
                      当前高度
                    </div>
                    <div style={{ 
                      fontSize: 24,
                      fontWeight: 'bold',
                      color: '#fa709a'
                    }}>
                      {armHeight.toFixed(2)} 米
                    </div>
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
                    trackStyle={{
                      background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
                    }}
                    handleStyle={{
                      borderColor: '#fa709a',
                      boxShadow: '0 0 10px rgba(250, 112, 154, 0.5)'
                    }}
                  />
                </div>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card 
                title="🦾 左侧展臂控制" 
                style={{ 
                  borderRadius: 12,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  border: 'none'
                }}
                styles={{
                  header: {
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    borderRadius: '12px 12px 0 0',
                    border: 'none',
                    fontSize: 16,
                    fontWeight: 600
                  }
                }}
              >
                <Space orientation="vertical" style={{ width: '100%' }} size="large">
                  <div style={{ 
                    background: '#f8f9fa',
                    padding: '16px',
                    borderRadius: 8,
                    textAlign: 'center'
                  }}>
                    <div style={{ 
                      marginBottom: 16,
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#495057'
                    }}>
                      展臂状态
                    </div>
                    <Space size="large">
                      <Button
                        type={leftArmStatus === 'open' ? 'primary' : 'default'}
                        onClick={() => handleArmControl('left', 'open')}
                        style={{
                          borderRadius: 8,
                          height: 40,
                          width: 80,
                          fontWeight: 600
                        }}
                      >
                        打开
                      </Button>
                      <Button
                        type={leftArmStatus === 'close' ? 'primary' : 'default'}
                        onClick={() => handleArmControl('left', 'close')}
                        style={{
                          borderRadius: 8,
                          height: 40,
                          width: 80,
                          fontWeight: 600
                        }}
                      >
                        关闭
                      </Button>
                    </Space>
                    <div style={{ 
                      marginTop: 12,
                      fontSize: 14,
                      color: leftArmStatus === 'open' ? '#28a745' : '#6c757d',
                      fontWeight: 500
                    }}>
                      {leftArmStatus === 'open' ? '🟢 展臂已打开' : '🔴 展臂已关闭'}
                    </div>
                  </div>
                  
                  <div style={{ 
                    background: '#f8f9fa',
                    padding: '16px',
                    borderRadius: 8,
                    textAlign: 'center'
                  }}>
                    <div style={{ 
                      marginBottom: 16,
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#495057'
                    }}>
                      水阀状态
                    </div>
                    <Switch
                      checked={leftValveStatus}
                      onChange={(checked) => handleValveToggle('left', checked)}
                      checkedChildren="开"
                      unCheckedChildren="关"
                      style={{
                        transform: 'scale(1.2)'
                      }}
                    />
                    <div style={{ 
                      marginTop: 12,
                      fontSize: 14,
                      color: leftValveStatus ? '#28a745' : '#6c757d',
                      fontWeight: 500
                    }}>
                      {leftValveStatus ? '🟢 水阀已开启' : '🔴 水阀已关闭'}
                    </div>
                  </div>
                </Space>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card 
                title="🦾 右侧展臂控制" 
                style={{ 
                  borderRadius: 12,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  border: 'none'
                }}
                styles={{
                  header: {
                    background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                    color: 'white',
                    borderRadius: '12px 12px 0 0',
                    border: 'none',
                    fontSize: 16,
                    fontWeight: 600
                  }
                }}
              >
                <Space orientation="vertical" style={{ width: '100%' }} size="large">
                  <div style={{ 
                    background: '#f8f9fa',
                    padding: '16px',
                    borderRadius: 8,
                    textAlign: 'center'
                  }}>
                    <div style={{ 
                      marginBottom: 16,
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#495057'
                    }}>
                      展臂状态
                    </div>
                    <Space size="large">
                      <Button
                        type={rightArmStatus === 'open' ? 'primary' : 'default'}
                        onClick={() => handleArmControl('right', 'open')}
                        style={{
                          borderRadius: 8,
                          height: 40,
                          width: 80,
                          fontWeight: 600
                        }}
                      >
                        打开
                      </Button>
                      <Button
                        type={rightArmStatus === 'close' ? 'primary' : 'default'}
                        onClick={() => handleArmControl('right', 'close')}
                        style={{
                          borderRadius: 8,
                          height: 40,
                          width: 80,
                          fontWeight: 600
                        }}
                      >
                        关闭
                      </Button>
                    </Space>
                    <div style={{ 
                      marginTop: 12,
                      fontSize: 14,
                      color: rightArmStatus === 'open' ? '#28a745' : '#6c757d',
                      fontWeight: 500
                    }}>
                      {rightArmStatus === 'open' ? '🟢 展臂已打开' : '🔴 展臂已关闭'}
                    </div>
                  </div>
                  
                  <div style={{ 
                    background: '#f8f9fa',
                    padding: '16px',
                    borderRadius: 8,
                    textAlign: 'center'
                  }}>
                    <div style={{ 
                      marginBottom: 16,
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#495057'
                    }}>
                      水阀状态
                    </div>
                    <Switch
                      checked={rightValveStatus}
                      onChange={(checked) => handleValveToggle('right', checked)}
                      checkedChildren="开"
                      unCheckedChildren="关"
                      style={{
                        transform: 'scale(1.2)'
                      }}
                    />
                    <div style={{ 
                      marginTop: 12,
                      fontSize: 14,
                      color: rightValveStatus ? '#28a745' : '#6c757d',
                      fontWeight: 500
                    }}>
                      {rightValveStatus ? '🟢 水阀已开启' : '🔴 水阀已关闭'}
                    </div>
                  </div>
                </Space>
              </Card>
            </Col>
          </Row>
                </div>
    </div>
  );
};

export default DeviceControl;
