import React, { useState, useEffect, useRef } from 'react';
import { Card, Row, Col, Switch, Button, Space, message, InputNumber, Slider } from 'antd';
import { socketService } from '../services/socket';

const DeviceControl: React.FC = () => {
  const [pumpStatus, setPumpStatus] = useState(false);
  const [leftArmStatus, setLeftArmStatus] = useState('close');
  const [rightArmStatus, setRightArmStatus] = useState('close');
  const [leftValveStatus, setLeftValveStatus] = useState(false);
  const [rightValveStatus, setRightValveStatus] = useState(false);
  const [armHeight, setArmHeight] = useState(1.0);
  const [armHeightStatus, setArmHeightStatus] = useState(false); // 支架高度状态：false=落, true=起
  const [limitSwitchState, setLimitSwitchState] = useState(0); // 限位开关状态：0=都未触发, 1=上限触发, 2=下限触发, 3=都触发
  // Reserved for future mode switching feature
  // const [controlMode, setControlMode] = useState<'auto' | 'manual'>('auto');
  const [velocity, setVelocity] = useState({ linear: 0, angular: 0 });
  const [steerAngle, setSteerAngle] = useState(0); // 转向角度 -34~34 度
  const [isMoving, setIsMoving] = useState(false);
  const velocityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentVelocityRef = useRef({ linear: 0, angular: 0 }); // 存储当前速度，供定时器使用
  const [maxSpeed, setMaxSpeed] = useState(0.2); // 默认最大速度0.2m/s，最大限制0.5m/s
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
        setArmHeightStatus(status.arm_height_status);
        setLimitSwitchState(status.limit_switch_state || 0);
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

  const handleArmHeightToggle = (checked: boolean) => {
    setArmHeightStatus(checked);
    setArmHeight(checked ? 2.0 : 1.0);
    publishRosCommand('/spray/arm_height_control', 'std_msgs/Bool', { data: checked });
    message.success(`支架已${checked ? '升起' : '落下'}`);
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

  // Reserved for future mode switching feature
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleModeSwitch = (mode: 'auto' | 'manual') => {
    // setControlMode(mode);
    if (mode === 'manual') {
      message.info('已切换到手动控制模式');
    } else {
      handleEmergencyStop();
      message.info('已切换到自动控制模式');
    }
  };

  // 发送速度命令
  const sendVelocityCommand = (linear: number, angular: number) => {
    const twistMsg = {
      linear: { x: linear, y: 0.0, z: 0.0 },
      angular: { x: 0.0, y: 0.0, z: angular }
    };
    publishRosCommand('/manual/cmd_vel', 'geometry_msgs/msg/Twist', twistMsg);
    console.log(`发送速度: linear=${linear.toFixed(2)} m/s, steer=${(angular * 34).toFixed(1)}°`);
  };

  // 启动定时发送
  const startVelocityPublishing = () => {
    if (velocityIntervalRef.current) return;
    
    setIsMoving(true);
    velocityIntervalRef.current = setInterval(() => {
      const { linear, angular } = currentVelocityRef.current;
      sendVelocityCommand(linear, angular);
    }, 100); // 每100ms发送一次
  };

  // 停止定时发送
  const stopVelocityPublishing = () => {
    if (velocityIntervalRef.current) {
      clearInterval(velocityIntervalRef.current);
      velocityIntervalRef.current = null;
    }
    setIsMoving(false);
  };

  // 线速度滑块变化处理
  const handleLinearSpeedChange = (value: number) => {
    const linear = value;
    const angular = steerAngle / 34; // 转向角度转换为比例 -1~1
    
    setVelocity({ linear, angular });
    currentVelocityRef.current = { linear, angular };
    
    // 如果有速度或转向，启动发送
    if (linear !== 0 || angular !== 0) {
      startVelocityPublishing();
    } else {
      // 停止
      stopVelocityPublishing();
      sendVelocityCommand(0, 0);
    }
  };

  // 转向滑块变化处理
  const handleSteerAngleChange = (value: number) => {
    setSteerAngle(value);
    const angular = value / 34; // 转向角度转换为比例 -1~1
    const linear = velocity.linear;
    
    currentVelocityRef.current = { linear, angular };
    
    // 如果有速度或转向，启动发送
    if (linear !== 0 || angular !== 0) {
      startVelocityPublishing();
    } else {
      stopVelocityPublishing();
      sendVelocityCommand(0, 0);
    }
  };

  // 转向滑块松手归零
  const handleSteerRelease = () => {
    console.log('转向滑块松手，归零');
    setSteerAngle(0);
    const angular = 0;
    const linear = velocity.linear;
    
    currentVelocityRef.current = { linear, angular };
    
    // 如果线速度也为0，停止发送
    if (linear === 0) {
      stopVelocityPublishing();
      sendVelocityCommand(0, 0);
    } else {
      // 只有线速度，继续发送
      sendVelocityCommand(linear, 0);
    }
  };

  // 线速度滑块松手归零
  const handleLinearRelease = () => {
    console.log('线速度滑块松手，归零');
    setVelocity({ linear: 0, angular: velocity.angular });
    const linear = 0;
    const angular = steerAngle / 34;
    
    currentVelocityRef.current = { linear, angular };
    
    // 如果转向也为0，停止发送
    if (angular === 0) {
      stopVelocityPublishing();
      sendVelocityCommand(0, 0);
    } else {
      // 只有转向，继续发送
      sendVelocityCommand(0, angular);
    }
  };

  // 停止按钮处理
  const handleStopAll = () => {
    console.log('停止所有运动');
    setVelocity({ linear: 0, angular: 0 });
    setSteerAngle(0);
    currentVelocityRef.current = { linear: 0, angular: 0 };
    stopVelocityPublishing();
    
    // 发送停止命令
    const stopMessage = {
      linear: { x: 0.0, y: 0.0, z: 0.0 },
      angular: { x: 0.0, y: 0.0, z: 0.0 }
    };
    publishRosCommand('/manual/cmd_vel', 'geometry_msgs/msg/Twist', stopMessage);
  };

  // Reserved for future joystick activation toggle
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
                {/* 控制区域布局：左边是转向滑块，右边是线速度滑块 */}
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '100%',
                  height: 280,
                  gap: 40
                }}>
                  
                  {/* 转向滑块 - 左右方向 */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center',
                    flex: 1
                  }}>
                    <div style={{ fontWeight: 600, color: '#495057', marginBottom: 8 }}>转向</div>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      width: '100%',
                      justifyContent: 'space-between'
                    }}>
                      <span style={{ fontSize: 12, color: '#17a2b8' }}>左34°</span>
                      <Slider
                        min={-34}
                        max={34}
                        step={1}
                        value={steerAngle}
                        onChange={handleSteerAngleChange}
                        onAfterChange={() => handleSteerRelease()}
                        tooltip={{ formatter: (v) => `${v || 0}°` }}
                        style={{ flex: 1, margin: '0 12px' }}
                        styles={{
                          track: { backgroundColor: steerAngle > 0 ? '#fd7e14' : steerAngle < 0 ? '#17a2b8' : '#d9d9d9' },
                          handle: { borderColor: steerAngle > 0 ? '#fd7e14' : steerAngle < 0 ? '#17a2b8' : '#667eea' }
                        }}
                      />
                      <span style={{ fontSize: 12, color: '#fd7e14' }}>右34°</span>
                    </div>
                    <div style={{ 
                      fontSize: 18, 
                      fontWeight: 'bold', 
                      color: steerAngle < 0 ? '#17a2b8' : steerAngle > 0 ? '#fd7e14' : '#6c757d',
                      marginTop: 8
                    }}>
                      {steerAngle < 0 ? '左转 ' : steerAngle > 0 ? '右转 ' : '直行'}
                      {Math.abs(steerAngle)}°
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>松手自动归零</div>
                  </div>

                  {/* 线速度滑块 - 上下方向 */}
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center'
                  }}>
                    <div style={{ fontWeight: 600, color: '#495057', marginBottom: 8 }}>速度</div>
                    <div style={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: 'center',
                      height: 180
                    }}>
                      <span style={{ fontSize: 12, color: '#28a745', marginBottom: 4 }}>前进</span>
                      <Slider
                        vertical
                        min={-maxSpeed}
                        max={maxSpeed}
                        step={0.01}
                        value={velocity.linear}
                        onChange={handleLinearSpeedChange}
                        onAfterChange={() => handleLinearRelease()}
                        tooltip={{ formatter: (v) => `${(v || 0).toFixed(2)} m/s` }}
                        style={{ height: 140 }}
                        styles={{
                          track: { backgroundColor: velocity.linear > 0 ? '#28a745' : velocity.linear < 0 ? '#dc3545' : '#d9d9d9' },
                          handle: { borderColor: velocity.linear > 0 ? '#28a745' : velocity.linear < 0 ? '#dc3545' : '#667eea' }
                        }}
                      />
                      <span style={{ fontSize: 12, color: '#dc3545', marginTop: 4 }}>后退</span>
                    </div>
                    <div style={{ 
                      fontSize: 18, 
                      fontWeight: 'bold', 
                      color: velocity.linear > 0 ? '#28a745' : velocity.linear < 0 ? '#dc3545' : '#6c757d',
                      marginTop: 8
                    }}>
                      {velocity.linear > 0 ? '前进 ' : velocity.linear < 0 ? '后退 ' : ''}
                      {Math.abs(velocity.linear).toFixed(2)} m/s
                    </div>
                    <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>松手自动归零</div>
                  </div>

                </div>

                {/* 停止按钮 */}
                <Button
                  type="primary"
                  danger
                  size="large"
                  onClick={handleStopAll}
                  style={{ width: '100%', marginTop: 16, height: 50, fontSize: 16 }}
                >
                  紧急停止
                </Button>

                {/* 当前状态显示 */}
                <div style={{ 
                  marginTop: 16,
                  textAlign: 'center',
                  background: 'white',
                  padding: '16px 24px',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                  width: '100%'
                }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                    当前状态
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
                      <div style={{ fontSize: 12, color: '#6c757d' }}>转向角度</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: '#764ba2' }}>
                        {steerAngle}°
                      </div>
                    </div>
                  </div>
                </div>

                {/* 完全接管模式切换按键 */}
                <div style={{ 
                  marginTop: 16,
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
                      ? '网页控制获得最高控制权，即使速度为0也保持控制' 
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
                    ⚡ 最大移动速度 (m/s) - 限制最高0.5m/s
                  </label>
                  <InputNumber
                    min={0.1}
                    max={0.5}
                    step={0.05}
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
                <Space orientation="vertical" style={{ width: '100%' }} size="large">
                  <div style={{
                    padding: '16px',
                    background: '#f8f9fa',
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
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
                </Space>
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card
                title="📏 支架高度控制"
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
                <Space orientation="vertical" style={{ width: '100%' }} size="large">
                  <div style={{
                    padding: '16px',
                    background: '#f8f9fa',
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{
                      marginBottom: 16,
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#495057'
                    }}>
                      支架状态
                    </div>
                    <Switch
                      checked={armHeightStatus}
                      onChange={handleArmHeightToggle}
                      checkedChildren="起"
                      unCheckedChildren="落"
                      size="default"
                      style={{
                        transform: 'scale(1.2)'
                      }}
                    />
                    <div style={{
                      marginTop: 12,
                      fontSize: 14,
                      color: armHeightStatus ? '#28a745' : '#6c757d',
                      fontWeight: 500
                    }}>
                      {armHeightStatus ? '🟢 支架已升起' : '🔴 支架已落下'}
                    </div>
                    <div style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: limitSwitchState === 1 ? '#28a745' : limitSwitchState === 2 ? '#6c757d' : limitSwitchState === 0 ? '#ffc107' : '#dc3545',
                      fontWeight: 400
                    }}>
                      {limitSwitchState === 1 ? '✓ 上限位已触发' : limitSwitchState === 2 ? '✓ 下限位已触发' : limitSwitchState === 0 ? '→ 限位未触发' : '⚠️ 限位异常'}
                    </div>
                  </div>
                </Space>
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{
                      marginBottom: 16,
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#495057'
                    }}>
                      展臂状态
                    </div>
                    <Switch
                      checked={leftArmStatus === 'open'}
                      onChange={(checked) => handleArmControl('left', checked ? 'open' : 'close')}
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <div style={{
                      marginBottom: 16,
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#495057'
                    }}>
                      展臂状态
                    </div>
                    <Switch
                      checked={rightArmStatus === 'open'}
                      onChange={(checked) => handleArmControl('right', checked ? 'open' : 'close')}
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
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center'
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
