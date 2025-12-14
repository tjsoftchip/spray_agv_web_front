import React, { useState, useEffect, useRef } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, message, Popconfirm, Tag, Row, Col } from 'antd';
import { PlusOutlined, SaveOutlined, DeleteOutlined, CheckOutlined, ZoomInOutlined, ZoomOutOutlined, ReloadOutlined } from '@ant-design/icons';
import { mapApi } from '../services/api';
import { socketService } from '../services/socket';

const MapManagement: React.FC = () => {
  const [maps, setMaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [mappingStatus, setMappingStatus] = useState<'idle' | 'mapping'>('idle');
  const [form] = Form.useForm();
  
  // 地图预览相关状态
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mapData, setMapData] = useState<any>(null);
  const [robotPose, setRobotPose] = useState<any>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadMaps();
    checkMappingStatus();
    
    // 连接WebSocket
    socketService.connect();
    
    // 定期检查建图状态
    const statusInterval = setInterval(() => {
      checkMappingStatus();
    }, 3000); // 每3秒检查一次
    
    return () => {
      clearInterval(statusInterval);
    };
  }, []);
  
  useEffect(() => {
    // 订阅地图数据
    socketService.on('ros_message', (data: any) => {
      console.log('Received ROS message:', data.topic, data.msg ? 'has msg' : 'no msg');
      
      if (data.topic === '/map') {
        console.log('Map data received:', data.msg ? 'has msg' : 'no msg');
        if (data.msg) {
          console.log('Map data structure:', {
            hasInfo: !!data.msg.info,
            hasData: !!data.msg.data,
            infoKeys: data.msg.info ? Object.keys(data.msg.info) : [],
            dataType: typeof data.msg.data,
            dataLength: data.msg.data ? (Array.isArray(data.msg.data) ? data.msg.data.length : 'not array') : 'no data'
          });
          if (data.msg.info && data.msg.data) {
            console.log('Map info:', data.msg.info);
            console.log('Map data length:', data.msg.data.length);
            console.log('Map data sample (first 10):', Array.isArray(data.msg.data) ? data.msg.data.slice(0, 10) : 'not array');
            setMapData(data.msg);
          } else {
            console.warn('Invalid map data structure:', data.msg);
          }
        }
      } else if (data.topic === '/robot_pose_k') {
        console.log('Robot pose received:', data.msg);
        setRobotPose(data.msg);
      } else if (data.topic === '/robot_pose') {
        console.log('Robot pose received:', data.msg);
        setRobotPose(data.msg);
      } else if (data.topic === '/odom') {
        // 使用里程计数据作为机器人位置（持续更新）
        if (data.msg && data.msg.pose && data.msg.pose.pose) {
          console.log('Using odom data as robot pose:', data.msg);
          const odomPose = {
            header: data.msg.header,
            pose: data.msg.pose.pose
          };
          setRobotPose(odomPose);
        }
      } else if (data.topic === '/amcl_pose') {
        // AMCL定位数据
        if (data.msg && data.msg.pose) {
          console.log('Using AMCL pose:', data.msg);
          const amclPose = {
            header: data.msg.header,
            pose: data.msg.pose.pose
          };
          setRobotPose(amclPose);
        }
      } else if (data.topic === '/tf') {
        // 从tf消息中提取base_link到map的变换
        if (data.msg && data.msg.transforms) {
          console.log('TF transforms received:', data.msg.transforms.length);
          data.msg.transforms.forEach((t: any) => {
            console.log(`TF: ${t.header.frame_id} -> ${t.child_frame_id}`);
          });
          
          // 查找正确的TF变换
          const allTransforms = data.msg.transforms;
          
          // 打印所有可用的TF变换
          console.log('Available TF transforms:');
          allTransforms.forEach((t: any) => {
            console.log(`  ${t.header.frame_id} -> ${t.child_frame_id}`);
          });
          
          // 查找 map -> odom -> base_footprint 的变换链
          const mapToOdom = allTransforms.find((t: any) => 
            t.header.frame_id === 'map' && t.child_frame_id === 'odom'
          );
          const odomToBase = allTransforms.find((t: any) => 
            t.header.frame_id === 'odom' && t.child_frame_id === 'base_footprint'
          );
          
          if (mapToOdom && odomToBase) {
            // 组合变换计算机器人在地图中的位置
            const mapX = mapToOdom.transform.translation.x + odomToBase.transform.translation.x;
            const mapY = mapToOdom.transform.translation.y + odomToBase.transform.translation.y;
            
            // 组合四元数计算朝向
            const q1 = mapToOdom.transform.rotation;
            const q2 = odomToBase.transform.rotation;
            
            // 四元数乘法（简化版本）
            const qw = q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z;
            const qx = q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y;
            const qy = q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x;
            const qz = q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w;
            
            // 计算偏航角
            const yaw = Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz));
            
            const tfPose = {
              header: mapToOdom.header,
              pose: {
                position: { x: mapX, y: mapY, z: 0 },
                orientation: { x: qx, y: qy, z: qz, w: qw }
              }
            };
            
            console.log('TF pose calculated:', tfPose);
            console.log('TF yaw (degrees):', yaw * 180 / Math.PI);
            setRobotPose(tfPose);
          } else {
            // 尝试查找 map -> base_footprint 直接变换
            const mapToBase = allTransforms.find((t: any) => 
              t.header.frame_id === 'map' && t.child_frame_id === 'base_footprint'
            );
            
            if (mapToBase) {
              console.log('Using direct map -> base_footprint transform');
              const tfPose = {
                header: mapToBase.header,
                pose: {
                  position: mapToBase.transform.translation,
                  orientation: mapToBase.transform.rotation
                }
              };
              
              const q = mapToBase.transform.rotation;
              const yaw = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.y * q.y + q.z * qz));
              console.log('Direct TF yaw (degrees):', yaw * 180 / Math.PI);
              
              setRobotPose(tfPose);
            } else {
              console.log('No suitable TF transforms found');
            }
          }
        }
      } else if (data.topic === '/tf_static') {
        // 静态tf变换
        if (data.msg && data.msg.transforms) {
          const staticTf = data.msg.transforms.find((t: any) => 
            t.header.frame_id === 'odom' && t.child_frame_id === 'base_link'
          );
          
          if (staticTf) {
            const staticPose = {
              header: staticTf.header,
              pose: {
                position: staticTf.transform.translation,
                orientation: staticTf.transform.rotation
              }
            };
            console.log('Using static tf as robot pose:', staticPose);
            setRobotPose(staticPose);
          }
        }
      }
    });
    
    return () => {
      socketService.off('ros_message');
    };
  }, []);
  
  // 设置canvas事件监听器
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // 添加非被动的事件监听器
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setScale(prev => Math.max(0.1, Math.min(5, prev * delta)));
    };
    
    canvas.addEventListener('wheel', wheelHandler, { passive: false });
    
    return () => {
      canvas.removeEventListener('wheel', wheelHandler);
    };
  }, []);

  // 绘制地图
  useEffect(() => {
    if (!canvasRef.current || !mapData) {
      console.log('No canvas or map data', { canvas: !!canvasRef.current, mapData: !!mapData });
      return;
    }
    
    console.log('Starting to draw map...');
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 设置canvas样式以便调试
    canvas.style.border = '2px solid red';
    canvas.style.backgroundColor = '#f0f0f0';
    
    // 安全检查：确保mapData.info和data存在
    if (!mapData.info || !mapData.data) {
      console.warn('Map data structure is incomplete:', mapData);
      return;
    }
    
    const { width, height } = mapData.info;
    let gridData = mapData.data;
    const resolution = mapData.info.resolution;
    
    // 确保gridData是数组且有正确的长度
    if (!Array.isArray(gridData) || gridData.length === 0) {
      console.warn('Invalid grid data:', gridData);
      return;
    }
    
    // 缓存地图尺寸，避免抖动
    const mapKey = `${width}x${height}`;
    if (canvas.dataset.mapKey !== mapKey) {
      // 设置画布尺寸
      canvas.width = width;
      canvas.height = height;
      canvas.dataset.mapKey = mapKey;
      console.log('Canvas size updated to:', { width, height });
    }
    
    // 设置缩放
    const finalScale = scale * resolution;
    
    // 添加调试信息
    console.log('Canvas setup:');
    console.log('  Canvas width:', canvas.width);
    console.log('  Canvas height:', canvas.height);
    console.log('  Canvas style width:', canvas.style.width);
    console.log('  Canvas style height:', canvas.style.height);
    console.log('  Final scale:', finalScale);    
    // 计算合适的显示尺寸
    const maxDisplayWidth = 800;
    const maxDisplayHeight = 600;
    
    // 地图实际物理尺寸（米）
    const mapWidthMeters = width * resolution;
    const mapHeightMeters = height * resolution;
    
    // 计算基础缩放比例，使地图在容器中合适显示
    const baseScale = Math.min(
      maxDisplayWidth / mapWidthMeters,
      maxDisplayHeight / mapHeightMeters,
      100 // 最大放大100倍，确保小地图也能看清
    );
    
    // 应用用户缩放
    const adjustedScale = baseScale * scale;
    
    // 最终显示尺寸（像素）
    const displayWidth = mapWidthMeters * adjustedScale;
    const displayHeight = mapHeightMeters * adjustedScale;
    
    // 设置canvas显示尺寸和居中（只在尺寸改变时更新）
    const containerWidth = canvas.parentElement?.clientWidth || maxDisplayWidth;
    const containerHeight = canvas.parentElement?.clientHeight || maxDisplayHeight;
    
    const newLeft = `${(containerWidth - displayWidth) / 2}px`;
    const newTop = `${(containerHeight - displayHeight) / 2}px`;
    
    if (canvas.style.width !== `${displayWidth}px` || 
        canvas.style.height !== `${displayHeight}px` ||
        canvas.style.left !== newLeft ||
        canvas.style.top !== newTop) {
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
      canvas.style.left = newLeft;
      canvas.style.top = newTop;
    }
    
    // 清空画布
    ctx.clearRect(0, 0, width, height);
    
    // 绘制背景
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);
    
    // 绘制地图网格
    console.log('Drawing map with data length:', gridData.length);
    console.log('Expected data length:', width * height);
    console.log('Map resolution:', resolution);
    console.log('Map dimensions:', width, 'x', height);
    console.log('Map origin:', mapData.info.origin.position.x, mapData.info.origin.position.y);
    console.log('Grid data sample:', gridData.slice(0, 20));
    
    // 创建图像数据（默认方向，不旋转）
    const mapImageData = ctx.createImageData(width, height);
    let knownPixels = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // 地图数据是行优先存储的
        const i = y * width + x;
        const value = gridData[i];
        
        let color = 205; // 未知区域(浅灰色)
        
        if (value === 0) {
          color = 255; // 空闲区域(白色)
          knownPixels++;
        } else if (value === 100) {
          color = 0; // 占用区域(黑色)
          knownPixels++;
        } else if (value > 0 && value < 100) {
          // 占用概率区域
          color = Math.floor(255 - (value / 100) * 255);
          knownPixels++;
        }
        
        // 设置像素颜色
        const idx = (y * width + x) * 4;
        mapImageData.data[idx] = color;
        mapImageData.data[idx + 1] = color;
        mapImageData.data[idx + 2] = color;
        mapImageData.data[idx + 3] = 255;
      }
    }
    
    // 保存画布状态并应用地图变换：上下翻转 + 向左旋转90度
    ctx.save();
    // 应用变换：上下翻转 + 向左旋转90度
    // 1. 先将原点移动到画布中心，以便旋转
    ctx.translate(width / 2, height / 2);
    // 2. 向左旋转90度（逆时针）
    ctx.rotate(-Math.PI / 2);
    // 3. 上下翻转（垂直翻转）
    ctx.scale(1, -1);
    // 4. 将原点移回
    ctx.translate(-width / 2, -height / 2);
    
    // 绘制图像
    ctx.putImageData(mapImageData, 0, 0);
    
    // 恢复画布状态，以便后续绘制机器人
    ctx.restore();
    
    console.log('Map drawn successfully, known pixels:', knownPixels, 'of', gridData.length);
    console.log('Canvas size:', canvas.width, 'x', canvas.height);
    console.log('Canvas style size:', canvas.style.width, 'x', canvas.style.height);
    
    // 保存当前状态（用于绘制机器人）
    ctx.save();
    
    // 绘制机器人位置
    let robotX = width / 2; // 默认位置：地图中心
    let robotY = height / 2;
    let hasValidPose = false;
    
    if (robotPose && robotPose.pose && robotPose.pose.position && mapData.info && mapData.info.origin && mapData.info.origin.position) {
      // 计算机器人在地图像素坐标系中的位置
      // 注意：地图坐标系的原点在左下角，而canvas坐标系在左上角
      robotX = (robotPose.pose.position.x - mapData.info.origin.position.x) / resolution;
      robotY = (robotPose.pose.position.y - mapData.info.origin.position.y) / resolution;
      hasValidPose = true;
      console.log('Robot pose in world:', robotPose.pose.position.x, robotPose.pose.position.y);
      console.log('Robot pose in map pixels (before flip):', robotX, robotY);
      console.log('Map size:', width, 'x', height);
      console.log('Map origin:', mapData.info.origin.position.x, mapData.info.origin.position.y);
      console.log('Resolution:', resolution);
    } else {
      console.log('Robot pose data missing, using default center position:', robotPose);
    }
    
    // 确保机器人在地图范围内
    robotX = Math.max(0, Math.min(width, robotX));
    robotY = Math.max(0, Math.min(height, robotY));
    
    // 绘制机器人
    ctx.fillStyle = '#2196F3'; // 使用蓝色更接近地图应用中的车辆图标
    ctx.strokeStyle = '#1976D2'; // 深蓝色边框
    ctx.lineWidth = 2;
    
    // 计算机器人朝向
    let robotYaw = 0; // 默认朝上
    if (hasValidPose && robotPose.pose.orientation) {
      // 从四元数计算偏航角
      const q = robotPose.pose.orientation;
      robotYaw = Math.atan2(
        2 * (q.w * q.z + q.x * q.y),
        1 - 2 * (q.y * q.y + q.z * q.z)
      );

      // 机器人左右反转（水平翻转）
      robotYaw = -robotYaw;
      console.log('Robot yaw (radians):', robotYaw);
      console.log('Robot yaw (degrees):', robotYaw * 180 / Math.PI);
    }
    
    // 计算机器人在canvas上的显示位置
    // 地图坐标系原点在左下角，canvas坐标系在左上角
    const canvasX = robotX;
    const canvasY = height - 1 - robotY; // 翻转Y轴以匹配地图坐标系，-1因为索引从0开始
    
    // 应用地图变换：上下翻转 + 向左旋转90度
    // 变换公式：(x, y) → (height - 1 - y, x)
    const canvasX_transformed = height - 1 - canvasY;
    const canvasY_transformed = canvasX;
    
    console.log('Robot position in world:', robotPose?.pose?.position?.x, robotPose?.pose?.position?.y);
    console.log('Robot position in map pixels:', robotX, robotY);
    console.log('Canvas position (original):', canvasX, canvasY);
    console.log('Canvas position (transformed):', canvasX_transformed, canvasY_transformed);
    console.log('Map size:', width, 'x', height);
    
    // 机器人显示尺寸（相对于地图尺寸）
    const robotDisplaySize = Math.max(15, Math.min(30, width * 0.02)); // 动态调整，但不超过30像素
    
    // 绘制机器人（绿色箭头，类似RViz风格）
    console.log('Drawing robot at position:', canvasX_transformed, canvasY_transformed);
    
    ctx.save();
    ctx.translate(canvasX_transformed, canvasY_transformed);
    ctx.rotate(robotYaw);
    
    // 绘制机器人箭头（绿色）
    ctx.beginPath();
    ctx.moveTo(0, -robotDisplaySize); // 箭头顶点
    ctx.lineTo(-robotDisplaySize * 0.5, robotDisplaySize * 0.5); // 左下角
    ctx.lineTo(0, robotDisplaySize * 0.2); // 箭头底部中心
    ctx.lineTo(robotDisplaySize * 0.5, robotDisplaySize * 0.5); // 右下角
    ctx.closePath();
    
    ctx.fillStyle = '#4CAF50'; // 绿色填充
    ctx.fill();
    ctx.strokeStyle = '#2E7D32'; // 深绿色边框
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    // 绘制中心点
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, 2 * Math.PI);
    ctx.fillStyle = '#FFFFFF'; // 白色中心点
    ctx.fill();
    
    ctx.restore();
    
    // 添加调试信息
    console.log('Robot drawn at:', canvasX_transformed, canvasY_transformed, 'size:', robotDisplaySize);
    console.log('Robot yaw (degrees):', robotYaw * 180 / Math.PI);
    console.log('Robot visible on canvas:', canvasX_transformed >= 0 && canvasX_transformed <= width && canvasY_transformed >= 0 && canvasY_transformed <= height);
    
    console.log('Robot drawn at canvas position:', canvasX_transformed, canvasY_transformed, 'size:', robotDisplaySize);
    
    // 恢复画布状态
    ctx.restore();
  }, [mapData?.info?.width, mapData?.info?.height, mapData?.data?.slice(0, 100), robotPose, scale, offset]);

  const loadMaps = async () => {
    setLoading(true);
    try {
      const data = await mapApi.getMaps();
      setMaps(data);
    } catch (error: any) {
      message.error('加载地图列表失败');
    } finally {
      setLoading(false);
    }
  };

  const checkMappingStatus = async () => {
    try {
      // 首先尝试通过API服务获取状态
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const response = await fetch(`${window.location.protocol}//${window.location.hostname}:3000/api/maps/mapping-status`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.ok) {
            const status = await response.json();
            console.log('Mapping status response:', status);
            if (status.isMapping) {
              setMappingStatus('mapping');
              return;
            } else {
              setMappingStatus('idle');
              return;
            }
          }
        } catch (error) {
          console.log('API request failed, trying local endpoint');
        }
      }
      
      // 备选方案：使用本地状态检查端点
      const localResponse = await fetch(`${window.location.protocol}//${window.location.hostname}:3000/api/maps/mapping-status-local`);
      if (localResponse.ok) {
        const status = await localResponse.json();
        console.log('Local mapping status:', status);
        if (status.isMapping) {
          setMappingStatus('mapping');
        } else {
          setMappingStatus('idle');
        }
      } else {
        console.log('Local endpoint also failed');
        setMappingStatus('idle');
      }
    } catch (error) {
      console.error('Failed to check mapping status:', error);
      setMappingStatus('idle');
    }
  };

  const handleStartMapping = async () => {
    try {
      await mapApi.startMapping();
      setMappingStatus('mapping');
      message.success('开始建图');
    } catch (error: any) {
      message.error('启动建图失败');
    }
  };

  const handleStopMapping = async () => {
    try {
      await mapApi.stopMapping();
      setMappingStatus('idle');
      setSaveModalVisible(true);
    } catch (error: any) {
      message.error('停止建图失败');
    }
  };

  const handleSaveMap = async () => {
    try {
      const values = await form.validateFields();
      await mapApi.saveMap(values.name);
      message.success('地图保存成功');
      setSaveModalVisible(false);
      form.resetFields();
      loadMaps();
    } catch (error: any) {
      message.error('保存地图失败');
    }
  };

  const handleLoadMap = async (id: string) => {
    try {
      await mapApi.loadMap(id);
      message.success('地图加载成功');
      loadMaps();
    } catch (error: any) {
      message.error('加载地图失败');
    }
  };

  const handleDeleteMap = async (id: string) => {
    try {
      await mapApi.deleteMap(id);
      message.success('删除成功');
      loadMaps();
    } catch (error: any) {
      message.error('删除失败');
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await mapApi.setActiveMap(id);
      message.success('已设置为默认地图');
      loadMaps();
    } catch (error: any) {
      message.error('设置失败');
    }
  };
  
  // 地图缩放
  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 5));
  };
  
  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.1));
  };
  
  // 地图拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  // 鼠标滚轮缩放
  const handleWheel = (e: React.WheelEvent) => {
    // 不需要阻止默认行为，直接处理缩放
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.1, Math.min(5, prev * delta)));
  };

  // 重置视图
  const handleResetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const columns = [
    {
      title: '地图名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '状态',
      key: 'isActive',
      render: (_: any, record: any) => (
        record.isActive ? (
          <Tag color="green" icon={<CheckOutlined />}>默认地图</Tag>
        ) : (
          <Tag>未激活</Tag>
        )
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleLoadMap(record.id)}
          >
            加载
          </Button>
          {!record.isActive && (
            <Button 
              type="link" 
              size="small"
              onClick={() => handleSetActive(record.id)}
            >
              设为默认
            </Button>
          )}
          <Popconfirm
            title="确定删除此地图吗？"
            onConfirm={() => handleDeleteMap(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card 
            title="地图管理" 
            extra={
              <Space>
                {mappingStatus === 'idle' ? (
                  <Button 
                    type="primary" 
                    icon={<PlusOutlined />}
                    onClick={handleStartMapping}
                  >
                    开始建图
                  </Button>
                ) : (
                  <Button 
                    danger
                    icon={<SaveOutlined />}
                    onClick={handleStopMapping}
                  >
                    停止并保存
                  </Button>
                )}
              </Space>
            }
          >
            {mappingStatus === 'mapping' && (
              <div style={{ 
                padding: '20px', 
                background: '#fff7e6', 
                border: '1px solid #ffd591',
                borderRadius: '4px',
                marginBottom: '16px'
              }}>
                <p style={{ margin: 0, color: '#fa8c16' }}>
                  <strong>正在建图中...</strong> 请控制机器人在场地内移动，覆盖所有需要建图的区域
                </p>
              </div>
            )}

            <Table
              columns={columns}
              dataSource={maps}
              rowKey="id"
              loading={loading}
              style={{ width: '100%' }}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>
        
        <Col xs={24} lg={12}>
          <Card 
            title="地图预览" 
            extra={
              <Space>
                <Button 
                  icon={<ZoomInOutlined />} 
                  onClick={handleZoomIn}
                  size="small"
                >
                  放大
                </Button>
                <Button 
                  icon={<ZoomOutOutlined />} 
                  onClick={handleZoomOut}
                  size="small"
                >
                  缩小
                </Button>
                <Button 
                  icon={<ReloadOutlined />} 
                  onClick={handleResetView}
                  size="small"
                >
                  重置
                </Button>
              </Space>
            }
          >
            {mapData && (
              <div style={{ 
                marginBottom: '10px', 
                padding: '8px', 
                background: '#f5f5f5',
                borderRadius: '4px',
                fontSize: '12px',
                color: '#666'
              }}>
                <Space separator={<span>|</span>}>
                  <span>分辨率: {mapData.info.resolution.toFixed(3)} m/pixel</span>
                  <span>尺寸: {mapData.info.width} × {mapData.info.height}</span>
                  <span>实际大小: {(mapData.info.width * mapData.info.resolution).toFixed(2)} × {(mapData.info.height * mapData.info.resolution).toFixed(2)} m</span>
                  <span>缩放: {(scale * 100).toFixed(0)}%</span>
                </Space>
              </div>
            )}
            <div 
              style={{ 
                width: '100%', 
                height: '600px', 
                border: '1px solid #d9d9d9',
                borderRadius: '4px',
                overflow: 'hidden',
                cursor: isDragging ? 'grabbing' : 'grab',
                background: '#f0f0f0',
                position: 'relative'
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            >
              <canvas 
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  imageRendering: 'pixelated'
                }}
              />
              {!mapData && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: '#999',
                  fontSize: '16px'
                }}>
                  {mappingStatus === 'mapping' ? '等待地图数据...' : '请开始建图或加载地图'}
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Row>

      <Modal
        title="保存地图"
        open={saveModalVisible}
        onOk={handleSaveMap}
        onCancel={() => {
          setSaveModalVisible(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="地图名称"
            rules={[{ required: true, message: '请输入地图名称' }]}
          >
            <Input placeholder="例如: 一号梁场地图" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MapManagement;
