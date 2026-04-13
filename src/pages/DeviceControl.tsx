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
  const [steerAngle, setSteerAngle] = useState(0); // 转向角度 -18~18 度
  const [maxSteerAngle, setMaxSteerAngle] = useState(24); // 最大转向角度，默认24度
  const [joystickPosition, setJoystickPosition] = useState({ x: 0, y: 0 }); // 摇杆位置 -1~1
  const [isDragging, setIsDragging] = useState(false);
  const joystickRef = useRef<HTMLDivElement>(null);
  const [isMoving, setIsMoving] = useState(false);
  const velocityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentVelocityRef = useRef({ linear: 0, angular: 0 }); // 存储当前速度，供定时器使用
  const [maxSpeed, setMaxSpeed] = useState(0.35); // 默认最大速度0.35m/s，最大限制1m/s
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
    // 生产环境移除高频日志
  };

  // 启动定时发送
  const startVelocityPublishing = () => {
    if (velocityIntervalRef.current) return;
    
    setIsMoving(true);
    velocityIntervalRef.current = setInterval(() => {
      const { linear, angular } = currentVelocityRef.current;
      sendVelocityCommand(linear, angular);
    }, 150); // 每150ms发送一次（约6-7Hz，平衡流畅度和性能）
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

  // 摇杆位置处理 - 速度和转向与摇杆距离成正比
  const handleJoystickMove = (x: number, y: number) => {
    setJoystickPosition({ x, y });
    
    const linear = y * maxSpeed;
    // 计算转向角度（应用maxSteerAngle限制），然后镜像反转
    const angle = Math.round(x * maxSteerAngle);
    // angular 基于34度比例，但使用受限制的角度值，并反转方向
    const angular = -angle / 34;
    
    setSteerAngle(angle);
    setVelocity({ linear, angular });
    currentVelocityRef.current = { linear, angular };
    
    if (linear !== 0 || angular !== 0) {
      startVelocityPublishing();
    } else {
      stopVelocityPublishing();
      sendVelocityCommand(0, 0);
    }
  };

  const handleJoystickRelease = () => {
    setIsDragging(false);
    setJoystickPosition({ x: 0, y: 0 });
    setSteerAngle(0);
    setVelocity({ linear: 0, angular: 0 });
    currentVelocityRef.current = { linear: 0, angular: 0 };
    
    stopVelocityPublishing();
    sendVelocityCommand(0, 0);
  };

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!isDragging || !joystickRef.current) return;
      
      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      let normalizedX = (e.clientX - centerX) / (rect.width / 2);
      let normalizedY = -(e.clientY - centerY) / (rect.height / 2);
      
      normalizedX = Math.max(-1, Math.min(1, normalizedX));
      normalizedY = Math.max(-1, Math.min(1, normalizedY));
      
      handleJoystickMove(normalizedX, normalizedY);
    };
    
    const handleGlobalMouseUp = () => {
      if (isDragging) handleJoystickRelease();
    };
    
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (!isDragging || !joystickRef.current) return;
      e.preventDefault();
      
      const rect = joystickRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      let normalizedX = (e.touches[0].clientX - centerX) / (rect.width / 2);
      let normalizedY = -(e.touches[0].clientY - centerY) / (rect.height / 2);
      
      normalizedX = Math.max(-1, Math.min(1, normalizedX));
      normalizedY = Math.max(-1, Math.min(1, normalizedY));
      
      handleJoystickMove(normalizedX, normalizedY);
    };
    
    const handleGlobalTouchEnd = () => {
      if (isDragging) handleJoystickRelease();
    };
    
    if (isDragging) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
      window.addEventListener('touchend', handleGlobalTouchEnd);
    }
    
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isDragging]);

  const handleJoystickStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDragging(true);
    handleJoystickMove(0, 0);
  };

  // 停止按钮处理
  const handleStopAll = () => {
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
                {/* 方形摇杆控制区域 */}
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '100%',
                  gap: 16
                }}>
                  <div style={{ fontWeight: 600, color: '#495057', marginBottom: 4 }}>方形摇杆</div>
                  
                  {/* 摇杆外框 */}
                  <div 
                    ref={joystickRef}
                    onMouseDown={handleJoystickStart}
                    onTouchStart={handleJoystickStart}
                    style={{
                      width: 200,
                      height: 200,
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      position: 'relative',
                      cursor: 'pointer',
                      touchAction: 'none',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2), inset 0 2px 4px rgba(255, 255, 255, 0.2)',
                      border: '3px solid rgba(255, 255, 255, 0.3)'
                    }}
                  >
                    {/* 中心标记 */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.2)',
                      border: '2px dashed rgba(255, 255, 255, 0.5)'
                    }} />
                    
                    {/* 方向指示 */}
                    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', color: 'white', fontSize: 12, fontWeight: 600 }}>前</div>
                    <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', color: 'white', fontSize: 12, fontWeight: 600 }}>后</div>
                    <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'white', fontSize: 12, fontWeight: 600 }}>左</div>
                    <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: 'white', fontSize: 12, fontWeight: 600 }}>右</div>
                    
                    {/* 摇杆圆球 */}
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      width: 50,
                      height: 50,
                      borderRadius: '50%',
                      background: joystickPosition.x !== 0 || joystickPosition.y !== 0 
                        ? 'linear-gradient(135deg, #ffd700 0%, #ff8c00 100%)'
                        : 'linear-gradient(135deg, #ffffff 0%, #e0e0e0 100%)',
                      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)',
                      transform: `translate(calc(-50% + ${joystickPosition.x * 70}px), calc(-50% + ${-joystickPosition.y * 70}px))`,
                      transition: isDragging ? 'none' : 'transform 0.15s ease-out',
                      border: '3px solid rgba(0, 0, 0, 0.2)'
                    }} />
                  </div>
                  
                  {/* 当前状态显示 */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-around',
                    width: '100%',
                    padding: '12px 16px',
                    background: 'white',
                    borderRadius: 8,
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#6c757d' }}>速度</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: velocity.linear > 0 ? '#28a745' : velocity.linear < 0 ? '#dc3545' : '#667eea' }}>
                        {velocity.linear > 0 ? '前进 ' : velocity.linear < 0 ? '后退 ' : ''}
                        {Math.abs(velocity.linear).toFixed(2)} m/s
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 12, color: '#6c757d' }}>转向</div>
                      <div style={{ fontSize: 18, fontWeight: 'bold', color: steerAngle < 0 ? '#17a2b8' : steerAngle > 0 ? '#fd7e14' : '#764ba2' }}>
                        {steerAngle < 0 ? '左转 ' : steerAngle > 0 ? '右转 ' : '直行'}
                        {Math.abs(steerAngle)}°
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>推动摇杆控制方向和速度，松手自动停止</div>
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
                    <li style={{ marginBottom: 8 }}>上下推动：控制前进/后退，速度与推距成正比</li>
                    <li style={{ marginBottom: 8 }}>左右推动：控制左转/右转，角度与推距成正比（最大{maxSteerAngle}°）</li>
                    <li style={{ marginBottom: 8 }}>可同时控制两个方向</li>
                    <li>松开摇杆：自动停止</li>
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
                    ⚡ 最大移动速度 (m/s) - 限制最高1m/s
                  </label>
                  <InputNumber
                    min={0.1}
                    max={1.0}
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
                
                <div style={{ marginBottom: 24 }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: 12,
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#495057'
                  }}>
                    🔄 最大转向角度 (度) - 限制最高34度
                  </label>
                  <InputNumber
                    min={5}
                    max={34}
                    step={1}
                    value={maxSteerAngle}
                    onChange={(value) => {
                      if (value) {
                        setMaxSteerAngle(value);
                        message.success(`最大转向角度已设置为 ${value}°`);
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
