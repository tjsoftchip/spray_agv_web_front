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
  const [scaleToFillHeight, setScaleToFillHeight] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const loadMaps = async () => {
    try {
      const response = await fetch('/api/maps/scan-local');
      const data = await response.json();
      setMaps(data);
    } catch (error) {
      console.error('Failed to load maps:', error);
    }
  };

  useEffect(() => {
    // 立即加载地图列表和检查建图状态
    const initializeComponent = async () => {
      console.log('Initializing MapManagement component...');
      await loadMaps();
      await checkMappingStatus();
    };
    
    initializeComponent();
    
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
// 监听ROS消息
    socketService.on('ros_message', (data: any) => {
      if (data.topic === '/map') {
        console.log('Received map data:', data.msg);
        setMapData(data.msg);
      } else if (data.topic === '/robot_pose') {
        console.log('Received robot pose:', data.msg);
        setRobotPose({
          header: { frame_id: 'map' },
          pose: {
            position: data.msg.position || data.msg.pose?.position,
            orientation: data.msg.orientation || data.msg.pose?.orientation
          }
        });
      } else if (data.topic === '/robot_pose_k') {
        console.log('Received robot pose_k:', data.msg);
        setRobotPose({
          header: { frame_id: 'map' },
          pose: {
            position: data.msg.position || data.msg.pose?.position,
            orientation: data.msg.orientation || data.msg.pose?.orientation
          }
        });
      } else if (data.topic === '/amcl_pose') {
        console.log('Received AMCL pose:', data.msg);
        setRobotPose(data.msg);
      } else if (data.topic === '/odom') {
        // 里程计数据作为备选
        if (data.msg && data.msg.pose && data.msg.pose.pose) {
          console.log('Using odom data as robot pose:', data.msg);
          const odomPose = {
            header: data.msg.header,
            pose: data.msg.pose.pose
          };
          setRobotPose(odomPose);
        }
      } else if (data.topic === '/tf') {
        // 从TF消息中提取map->base_link变换
        if (data.msg && data.msg.transforms) {
          const mapToBase = data.msg.transforms.find((t: any) => 
            t.header.frame_id === 'map' && t.child_frame_id === 'base_link'
          );
          if (mapToBase) {
            console.log('Found map->base_link transform:', mapToBase);
            setRobotPose({
              header: { frame_id: 'map' },
              pose: {
                position: mapToBase.transform.translation,
                orientation: mapToBase.transform.rotation
              }
            });
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
    
    // 缓存地图尺寸和原点，避免抖动
    // 使用四舍五入避免微小变化导致的频繁更新
    const originX = Math.round(mapData.info.origin.position.x * 100) / 100;
    const originY = Math.round(mapData.info.origin.position.y * 100) / 100;
    const mapKey = `${width}x${height}_${originX}_${originY}`;
    
    if (canvas.dataset.mapKey !== mapKey) {
      // 设置画布尺寸
      canvas.width = width;
      canvas.height = height;
      canvas.dataset.mapKey = mapKey;
      console.log('Canvas size updated to:', { width, height, origin: { x: originX, y: originY } });
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
    // 计算容器尺寸
    const containerWidth = canvas.parentElement?.clientWidth || 800;
    const containerHeight = canvas.parentElement?.clientHeight || 600;
    const mapHeightMeters = height * resolution;
    
    // 计算缩放比例，使地图占满画布高度
    const calculatedScale = containerHeight / mapHeightMeters;
    setScaleToFillHeight(calculatedScale);
    
    // 应用用户缩放，但确保地图始终可见
    const adjustedScale = calculatedScale * scale;
    
    // 最终显示尺寸（像素）
    const displayWidth = width * resolution * adjustedScale;
    const displayHeight = containerHeight;
    
    // 设置canvas显示尺寸和居中
    const newLeft = `${(containerWidth - displayWidth) / 2}px`;
    const newTop = `0px`;
    
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
        
        // 修正激光雷达倒装问题，计算y轴翻转后的像素索引
        const flipY = height - 1 - y;
        const idx = (flipY * width + x) * 4;
        // 设置像素颜色
        //const idx = (y * width + x) * 4;
        mapImageData.data[idx] = color;
        mapImageData.data[idx + 1] = color;
        mapImageData.data[idx + 2] = color;
        mapImageData.data[idx + 3] = 255;
      }
    }
    
    // 绘制图像
    ctx.putImageData(mapImageData, 0, 0);
    
    // 绘制机器人
    if (robotPose && robotPose.pose) {
      const { position, orientation } = robotPose.pose;
      
      // 将机器人坐标从米转换为像素坐标
      const robotX = (position.x - mapData.info.origin.position.x) / resolution;
      const robotY = (position.y - mapData.info.origin.position.y) / resolution;
      
      // 应用地图的上下镜像（因为地图已经翻转了）
      const canvasRobotY = height - 1 - robotY;
      
      // 计算机器人朝向（从四元数转换为欧拉角）
      const { x: qx, y: qy, z: qz, w: qw } = orientation;
      const robotYaw = Math.atan2(2 * (qw * qz + qx * qy), 1 - 2 * (qy * qy + qz * qz));
      
      // 机器人显示尺寸（相对于地图尺寸），缩小为一半
      const robotDisplaySize = Math.max(5, Math.min(10, width * 0.01));
      
      // 保存画布状态
      ctx.save();
      
      // 移动到机器人位置
      ctx.translate(robotX, canvasRobotY);
      
      // 绘制机器人主体（圆形）
      ctx.fillStyle = '#ff4d4f';
      ctx.beginPath();
      ctx.arc(0, 0, robotDisplaySize / 2, 0, 2 * Math.PI);
      ctx.fill();
      
      // 绘制方向指示器（箭头）
      ctx.strokeStyle = '#ff4d4f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(
        robotDisplaySize * Math.cos(robotYaw),
        robotDisplaySize * Math.sin(robotYaw)
      );
      ctx.stroke();
      
      // 绘制方向箭头头部
      const arrowSize = robotDisplaySize * 0.3;
      const arrowAngle = Math.PI / 6;
      const endX = robotDisplaySize * Math.cos(robotYaw);
      const endY = robotDisplaySize * Math.sin(robotYaw);
      
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * Math.cos(robotYaw - arrowAngle),
        endY - arrowSize * Math.sin(robotYaw - arrowAngle)
      );
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - arrowSize * Math.cos(robotYaw + arrowAngle),
        endY - arrowSize * Math.sin(robotYaw + arrowAngle)
      );
      ctx.stroke();
      
      // 恢复画布状态
      ctx.restore();
      
      // 输出调试信息
      const yawDegrees = (robotYaw * 180 / Math.PI).toFixed(2);
      console.log('Robot drawn at:', {
        x: robotX.toFixed(2),
        y: canvasRobotY.toFixed(2),
        yaw: yawDegrees + '°',
        quaternion: { qx, qy, qz, qw },
        arrowEnd: {
          x: (robotDisplaySize * Math.cos(robotYaw)).toFixed(2),
          y: (robotDisplaySize * Math.sin(robotYaw)).toFixed(2)
        }
      });
    }
  }, [mapData, robotPose, scale, scaleToFillHeight]);

  const checkMappingStatus = async () => {
    try {
      // 使用mapApi获取状态
      const response = await mapApi.getMappingStatusLocal();
      console.log('Mapping status response:', response);
      
      // 明确判断建图状态，严格检查 isMapping 字段
      if (response && typeof response.isMapping === 'boolean') {
        const newStatus = response.isMapping ? 'mapping' : 'idle';
        console.log('Setting mapping status to:', newStatus);
        setMappingStatus(newStatus);
      } else {
        // 如果响应格式不正确，默认设置为 idle
        console.warn('Invalid mapping status response, defaulting to idle:', response);
        setMappingStatus('idle');
      }
    } catch (error) {
      console.error('Failed to check mapping status:', error);
      // 网络错误时设置为 idle，避免误显示建图状态
      setMappingStatus('idle');
    }
  };

  const handleStartMapping = async () => {
    try {
      // 先设置为建图状态，提供即时反馈
      setMappingStatus('mapping');
      message.loading('正在启动建图，请稍候...', 0);
      
      // 调用本地建图API
      await mapApi.startMappingLocal();
      
      message.destroy(); // 关闭loading
      message.success('开始建图');
      
      // 延迟2秒后再检查状态，确保后端状态已更新
      setTimeout(() => {
        checkMappingStatus();
      }, 2000);
    } catch (error: any) {
      message.destroy(); // 关闭loading
      console.error('启动建图失败:', error);
      
      // 检查是否是超时错误
      if (error.code === 'ECONNABORTED' && error.message.includes('timeout')) {
        // 超时但不代表失败，检查实际状态
        message.warning('启动请求超时，正在检查实际状态...');
        setTimeout(() => {
          checkMappingStatus();
        }, 2000);
      } else {
        // 其他错误，恢复为空闲状态
        setMappingStatus('idle');
        message.error('启动建图失败');
      }
    }
  };

  const handleStopMapping = async () => {
    try {
      // 先显示保存对话框，让用户输入地图名称
      setSaveModalVisible(true);
    } catch (error: any) {
      console.error('停止建图失败:', error);
      message.error('停止建图失败');
    }
  };

  const handleStopAndSaveMapping = async (mapName: string) => {
    try {
      // 先调用保存地图API
      message.loading('正在保存地图，请稍候...', 0);
      console.log('开始保存地图:', mapName);
      
      await mapApi.saveMapLocal({ mapName });
      
      // 等待一段时间确保地图保存完成
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      message.destroy(); // 关闭loading
      message.success('地图保存成功');
      
      // 然后停止建图节点
      console.log('开始停止建图节点...');
      await mapApi.stopMappingLocal();
      
      setMappingStatus('idle');
      message.success('建图已停止并保存成功');
      setSaveModalVisible(false);
      // 重新加载地图列表
      loadMaps();
    } catch (error: any) {
      message.destroy(); // 关闭loading
      console.error('停止并保存建图失败:', error);
      message.error('停止并保存建图失败');
      // 如果保存失败，提供强制停止选项
      Modal.confirm({
        title: '保存地图失败',
        content: '保存地图失败，是否强制停止建图？（强制停止将不会保存地图）',
        onOk: async () => {
          try {
            await mapApi.stopMappingLocal();
            setMappingStatus('idle');
            message.success('已强制停止建图');
            setSaveModalVisible(false);
          } catch (forceError: any) {
            message.error('强制停止建图也失败');
          }
        }
      });
    }
  };

  const handleForceStopMapping = async () => {
    try {
      await mapApi.forceStopMapping();
      setMappingStatus('idle');
      message.success('已强制停止建图');
      setSaveModalVisible(false);
    } catch (error: any) {
      message.error('强制停止建图失败');
    }
  };

  const handleSaveMap = async () => {
    try {
      const values = await form.validateFields();
      // 先保存地图
      await mapApi.saveMapLocal({ mapName: values.name });
      message.success('地图保存成功');
      
      // 然后停止建图
      await mapApi.stopMappingLocal();
      setMappingStatus('idle');
      message.success('建图已停止');
      
      setSaveModalVisible(false);
      form.resetFields();
      
      // 重新加载地图列表
      loadMaps();
    } catch (error: any) {
      message.error('保存地图或停止建图失败');
    }
  };

  const handleLoadMap = async (id: string) => {
    try {
      console.log('Loading map for preview:', id);
      message.loading({ content: '正在加载地图...', key: 'loadMap' });
      
      // 获取地图详细信息
      const response = await fetch(`/api/maps/scan-local`);
      const maps = await response.json();
      const selectedMap = maps.find((m: any) => m.id === id);
      
      if (!selectedMap) {
        message.error({ content: '地图不存在', key: 'loadMap' });
        return;
      }
      
      console.log('Selected map info:', selectedMap);
      
      // 从后端获取 PNG 图像数据
      const imageResponse = await fetch(`/api/maps/${id}/image`);
      if (!imageResponse.ok) {
        throw new Error('Failed to fetch map image');
      }
      
      const imageBlob = await imageResponse.blob();
      
      // 将 PNG 图像转换为地图数据
      const img = new Image();
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = selectedMap.width;
          canvas.height = selectedMap.height;
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            throw new Error('Failed to get canvas context');
          }
          
          // 绘制图像
          ctx.drawImage(img, 0, 0);
          
          // 获取像素数据
          const imageData = ctx.getImageData(0, 0, selectedMap.width, selectedMap.height);
          const pixels = imageData.data;
          
          // 转换为地图数据格式（0-100）
          const mapDataArray = [];
          for (let i = 0; i < pixels.length; i += 4) {
            const gray = pixels[i]; // R 通道（PNG 是灰度图）
            
            // 转换：白色(255) -> 0 (空闲), 黑色(0) -> 100 (占用), 灰色 -> -1 (未知)
            let value = -1;
            if (gray > 250) {
              value = 0; // 空闲
            } else if (gray < 10) {
              value = 100; // 占用
            } else if (gray > 200 && gray <= 250) {
              value = 0; // 接近白色，视为空闲
            }
            
            mapDataArray.push(value);
          }
          
          // 设置地图数据
          const mapData = {
            info: {
              width: selectedMap.width,
              height: selectedMap.height,
              resolution: selectedMap.resolution,
              origin: {
                position: selectedMap.origin
              }
            },
            data: mapDataArray
          };
          
          console.log('Map data constructed:', {
            width: mapData.info.width,
            height: mapData.info.height,
            resolution: mapData.info.resolution,
            dataLength: mapData.data.length,
            origin: mapData.info.origin.position
          });
          
          setMapData(mapData);
          message.success({ content: '地图预览加载成功', key: 'loadMap' });
          
          // 释放 blob URL
          URL.revokeObjectURL(img.src);
        } catch (error) {
          console.error('Error processing map image:', error);
          message.error({ content: '地图图像处理失败', key: 'loadMap' });
        }
      };
      
      img.onerror = () => {
        console.error('Failed to load map image');
        message.error({ content: '地图图像加载失败', key: 'loadMap' });
        URL.revokeObjectURL(img.src);
      };
      
      img.src = URL.createObjectURL(imageBlob);
      
      // 同时设置为激活地图
      await mapApi.setActiveMapLocal(id);
      loadMaps();
    } catch (error: any) {
      console.error('加载地图失败:', error);
      message.error({ content: '加载地图失败', key: 'loadMap' });
    }
  };

  const handleDeleteMap = async (id: string) => {
    try {
      console.log('Deleting map:', id);
      await mapApi.deleteMapLocal(id);
      message.success('删除成功');
      // 延迟刷新，确保文件系统操作完成
      setTimeout(() => {
        loadMaps();
      }, 500);
    } catch (error: any) {
      console.error('删除地图失败:', error);
      message.error('删除失败');
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      console.log('Setting active map:', id);
      await mapApi.setActiveMapLocal(id);
      message.success('已设置为默认地图');
      loadMaps();
    } catch (error: any) {
      console.error('设置默认地图失败:', error);
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
            key="load"
            type="link" 
            size="small"
            onClick={() => handleLoadMap(record.id)}
          >
            加载
          </Button>
          {!record.isActive && (
            <Button 
              key="setActive"
              type="link" 
              size="small"
              onClick={() => handleSetActive(record.id)}
            >
              设为默认
            </Button>
          )}
          <Popconfirm
            key="delete"
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
                  <span>自适应: {(scaleToFillHeight * 100).toFixed(0)}%</span>
                  {robotPose && robotPose.pose && (
                    <span>机器人: ({robotPose.pose.position.x.toFixed(2)}, {robotPose.pose.position.y.toFixed(2)})</span>
                  )}
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
        title="退出建图"
        open={saveModalVisible}
        onCancel={() => {
          setSaveModalVisible(false);
          form.resetFields();
        }}
        footer={[
          <Button key="cancel" onClick={() => {
            setSaveModalVisible(false);
            form.resetFields();
          }}>
            取消
          </Button>,
          <Button key="nosave" onClick={async () => {
            try {
              console.log('用户选择不保存，直接停止建图节点');
              await mapApi.stopMappingLocal();
              setMappingStatus('idle');
              message.success('已退出建图（未保存）');
              setSaveModalVisible(false);
              form.resetFields();
            } catch (error: any) {
              console.error('退出建图失败:', error);
              message.error('退出建图失败');
            }
          }}>
            不保存退出
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveMap}>
            保存并退出
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="地图名称（保存时需要）"
            rules={[{ required: false, message: '请输入地图名称' }]}
          >
            <Input placeholder="例如: 一号梁场地图" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MapManagement;
