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
    
    // 连接WebSocket
    socketService.connect();
    
    // 订阅地图数据
    socketService.on('ros_message', (data: any) => {
      console.log('Received ROS message:', data.topic, data.msg ? 'has msg' : 'no msg');
      
      if (data.topic === '/map') {
        console.log('Map data received:', data.msg);
        if (data.msg && data.msg.info && data.msg.data) {
          console.log('Map info:', data.msg.info);
          console.log('Map data length:', data.msg.data.length);
          setMapData(data.msg);
        } else {
          console.warn('Invalid map data structure:', data.msg);
        }
      } else if (data.topic === '/robot_pose_k') {
        console.log('Robot pose received:', data.msg);
        setRobotPose(data.msg);
      } else if (data.topic === '/odom') {
        // 如果没有robot_pose_k数据，使用里程计数据
        if (!robotPose && data.msg && data.msg.pose && data.msg.pose.pose) {
          console.log('Using odom data as robot pose:', data.msg);
          const odomPose = {
            header: data.msg.header,
            pose: data.msg.pose.pose
          };
          setRobotPose(odomPose);
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
    
    // 安全检查：确保mapData.info和data存在
    if (!mapData.info || !mapData.data) {
      console.warn('Map data structure is incomplete:', mapData);
      return;
    }
    
    const { width, height } = mapData.info;
    const gridData = mapData.data;
    const resolution = mapData.info.resolution;
    
    // 确保gridData是数组且有正确的长度
    if (!Array.isArray(gridData) || gridData.length === 0) {
      console.warn('Invalid grid data:', gridData);
      return;
    }
    
    // 缓存地图尺寸，避免抖动
    const mapKey = `${width}x${height}`;
    if (canvas.dataset.mapKey !== mapKey) {
      // 只在地图尺寸改变时更新canvas尺寸
      canvas.width = width;
      canvas.height = height;
      canvas.dataset.mapKey = mapKey;
      console.log('Canvas size updated to:', { width, height });
    }
    
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
    const finalScale = baseScale * scale;
    
    // 最终显示尺寸（像素）
    const displayWidth = mapWidthMeters * finalScale;
    const displayHeight = mapHeightMeters * finalScale;
    
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
    if (gridData.length === width * height) {
      const imageData = ctx.createImageData(width, height);
      for (let i = 0; i < gridData.length; i++) {
        const value = gridData[i];
        let color = 205; // 未知区域(灰色)
        
        if (value === 0) {
          color = 255; // 空闲区域(白色)
        } else if (value === 100) {
          color = 0; // 占用区域(黑色)
        }
        
        const idx = i * 4;
        imageData.data[idx] = color;
        imageData.data[idx + 1] = color;
        imageData.data[idx + 2] = color;
        imageData.data[idx + 3] = 255;
      }
      
      ctx.putImageData(imageData, 0, 0);
      console.log('Map drawn successfully');
    } else {
      console.error('Grid data length mismatch:', { 
        actual: gridData.length, 
        expected: width * height 
      });
      
      // 绘制错误提示
      ctx.fillStyle = '#ff0000';
      ctx.font = '20px Arial';
      ctx.fillText('地图数据错误', width/2 - 50, height/2);
    }
    
    // 保存当前状态
    ctx.save();
    
    // 应用缩放和平移
    ctx.scale(finalScale / resolution, finalScale / resolution);
    ctx.translate(offset.x / (finalScale / resolution), offset.y / (finalScale / resolution));
    
    // 绘制机器人位置
    let robotX = width / 2; // 默认位置：地图中心
    let robotY = height / 2;
    let hasValidPose = false;
    
    if (robotPose && robotPose.pose && robotPose.pose.position && mapData.info && mapData.info.origin && mapData.info.origin.position) {
      robotX = (robotPose.pose.position.x - mapData.info.origin.position.x) / resolution;
      robotY = height - (robotPose.pose.position.y - mapData.info.origin.position.y) / resolution;
      hasValidPose = true;
      console.log('Drawing robot at:', robotX, robotY, 'scale:', scale);
    } else {
      console.log('Robot pose data missing, using default center position:', robotPose);
    }
    
    // 绘制机器人
    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(robotX, robotY, 5 / scale, 0, 2 * Math.PI);
    ctx.fill();
    
    // 绘制机器人朝向
    if (hasValidPose && robotPose.pose.orientation) {
      const yaw = Math.atan2(
        2 * (robotPose.pose.orientation.w * robotPose.pose.orientation.z + 
             robotPose.pose.orientation.x * robotPose.pose.orientation.y),
        1 - 2 * (robotPose.pose.orientation.y * robotPose.pose.orientation.y + 
                 robotPose.pose.orientation.z * robotPose.pose.orientation.z)
      );
      
      const arrowLength = 15 / scale;
      const endX = robotX + arrowLength * Math.cos(yaw);
      const endY = robotY + arrowLength * Math.sin(yaw);
      
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.moveTo(robotX, robotY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    } else {
      // 绘制默认朝向（向上）
      const arrowLength = 15 / scale;
      const endX = robotX;
      const endY = robotY - arrowLength;
      
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.moveTo(robotX, robotY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
    
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
