import React, { useEffect, useRef, useState } from 'react';
import { Button, Space, message, Select } from 'antd';
import { EnvironmentOutlined, ZoomInOutlined, ZoomOutOutlined, AimOutlined } from '@ant-design/icons';
import { apiService } from '../services/api';

interface NavigationPoint {
  id: string;
  name: string;
  position: { x: number; y: number; z: number };
  type: 'start' | 'waypoint' | 'end';
  order: number;
}

interface RoadSegment {
  id: string;
  startNavPointId: string;
  endNavPointId: string;
  sprayParams: {
    pumpStatus: boolean;
    leftArmStatus: 'open' | 'close' | 'adjusting';
    rightArmStatus: 'open' | 'close' | 'adjusting';
    leftValveStatus: boolean;
    rightValveStatus: boolean;
    armHeight: number;
  };
}

interface PGMMapViewerProps {
  navigationPoints?: NavigationPoint[];
  roadSegments?: RoadSegment[];
  onMapClick?: (position: { x: number; y: number }) => void;
  onNavigationPointClick?: (point: NavigationPoint) => void;
  selectedMapId?: string;
  onMapChange?: (mapId: string) => void;
  showMapSelector?: boolean;
  height?: string;
  robotPosition?: { x: number; y: number };
}

const PGMMapViewer: React.FC<PGMMapViewerProps> = ({
  navigationPoints = [],
  roadSegments = [],
  onMapClick,
  selectedMapId,
  onMapChange,
  showMapSelector = true,
  height = '500px',
  robotPosition,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [maps, setMaps] = useState<any[]>([]);
  const [currentMap, setCurrentMap] = useState<any>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [localRobotPosition, setLocalRobotPosition] = useState<{ x: number; y: number } | undefined>(robotPosition);

  // 加载地图列表
  useEffect(() => {
    loadMaps();
  }, []);

  // 加载地图数据
  useEffect(() => {
    if (selectedMapId && maps.length > 0) {
      const mapInfo = maps.find(m => m.name === selectedMapId);
      if (mapInfo) {
        setCurrentMap(mapInfo);
      }
    }
  }, [selectedMapId, maps]);

  // 绘制地图
  useEffect(() => {
    if (currentMap && canvasRef.current) {
      drawMap();
    }
  }, [currentMap, navigationPoints, roadSegments, scale, offset, robotPosition]);

  const loadMaps = async () => {
    try {
      const data = await apiService.get('/maps/scan-local');
      setMaps(data);
      
      // 如果有选中的地图ID，则加载对应的地图
      if (selectedMapId) {
        const mapInfo = data.find((m: any) => m.name === selectedMapId);
        if (mapInfo) {
          setCurrentMap(mapInfo);
        }
      } else if (data.length > 0) {
        // 只有在没有指定地图ID时才选择第一个地图
        setCurrentMap(data[0]);
        if (onMapChange) {
          onMapChange(data[0].name);
        }
      }
    } catch (error) {
      console.error('Failed to load maps:', error);
      message.error('加载地图列表失败');
    }
  };



  const drawMap = () => {
    const canvas = canvasRef.current;
    if (!canvas || !currentMap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 加载并绘制PGM图像
    const img = new Image();
    img.onload = () => {
      // 计算缩放和偏移
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      
      // 设置缩放以适应画布
      const scaleX = canvasWidth / (currentMap.width * currentMap.resolution);
      const scaleY = canvasHeight / (currentMap.height * currentMap.resolution);
      const autoScale = Math.min(scaleX, scaleY) * 0.8;
      
      const finalScale = scale * autoScale;
      
      // 计算图像位置
      const imgWidth = currentMap.width * currentMap.resolution * finalScale;
      const imgHeight = currentMap.height * currentMap.resolution * finalScale;
      const imgX = (canvasWidth - imgWidth) / 2 + offset.x;
      const imgY = (canvasHeight - imgHeight) / 2 + offset.y;

      // 绘制地图图像
      ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight);

      // 绘制导航点连线
      drawRoadSegments(ctx, finalScale, imgX, imgY);
      
      // 绘制导航点
      drawNavigationPoints(ctx, finalScale, imgX, imgY);
      
      // 绘制机器人位置
      if (robotPosition || localRobotPosition) {
        drawRobotPosition(ctx, finalScale, imgX, imgY);
      }
    };

    // 加载PGM图像
    img.src = `/api/maps/${currentMap.name}/image`;
  };

  const drawNavigationPoints = (ctx: CanvasRenderingContext2D, scale: number, offsetX: number, offsetY: number) => {
    navigationPoints.forEach((point) => {
      // 世界坐标转换为相对世界坐标（米）
      const relativeWorldX = point.position.x - currentMap.origin.x;
      const relativeWorldY = point.position.y - currentMap.origin.y;
      
      // 相对世界坐标转换为画布坐标（需要翻转Y轴）
      // Y轴翻转：worldY 越大，画布 Y 应该越小
      const x = offsetX + relativeWorldX * scale;
      const y = offsetY + (currentMap.height * currentMap.resolution - relativeWorldY) * scale;

      // 设置颜色
      const colors = {
        start: '#52c41a',
        waypoint: '#1890ff',
        end: '#ff4d4f',
      };
      ctx.fillStyle = colors[point.type] || '#666';

      // 绘制圆形标记
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      // 绘制边框
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // 绘制序号
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(point.order.toString(), x, y);
    });
  };

  const drawRoadSegments = (ctx: CanvasRenderingContext2D, scale: number, offsetX: number, offsetY: number) => {
    roadSegments.forEach((segment) => {
      const startPoint = navigationPoints.find(p => p.id === segment.startNavPointId);
      const endPoint = navigationPoints.find(p => p.id === segment.endNavPointId);

      if (startPoint && endPoint) {
        // 世界坐标转换为相对世界坐标（米）
        const startRelWorldX = startPoint.position.x - currentMap.origin.x;
        const startRelWorldY = startPoint.position.y - currentMap.origin.y;
        const endRelWorldX = endPoint.position.x - currentMap.origin.x;
        const endRelWorldY = endPoint.position.y - currentMap.origin.y;
        
        // 相对世界坐标转换为画布坐标（需要翻转Y轴）
        const startX = offsetX + startRelWorldX * scale;
        const startY = offsetY + (currentMap.height * currentMap.resolution - startRelWorldY) * scale;
        const endX = offsetX + endRelWorldX * scale;
        const endY = offsetY + (currentMap.height * currentMap.resolution - endRelWorldY) * scale;

        // 绘制连线
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = segment.sprayParams.pumpStatus ? '#52c41a' : '#999';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 绘制箭头
        const angle = Math.atan2(endY - startY, endX - startX);
        const arrowLength = 15;
        const arrowAngle = Math.PI / 6;

        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowLength * Math.cos(angle - arrowAngle),
          endY - arrowLength * Math.sin(angle - arrowAngle)
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - arrowLength * Math.cos(angle + arrowAngle),
          endY - arrowLength * Math.sin(angle + arrowAngle)
        );
        ctx.stroke();
      }
    });
  };

  const drawRobotPosition = (ctx: CanvasRenderingContext2D, scale: number, offsetX: number, offsetY: number) => {
    const position = localRobotPosition || robotPosition;
    if (!position) return;
    
    // 世界坐标转换为相对世界坐标（米）
    const relativeWorldX = position.x - currentMap.origin.x;
    const relativeWorldY = position.y - currentMap.origin.y;
    
    // 相对世界坐标转换为画布坐标（需要翻转Y轴）
    const x = offsetX + relativeWorldX * scale;
    const y = offsetY + (currentMap.height * currentMap.resolution - relativeWorldY) * scale;

    // 绘制机器人位置
    ctx.fillStyle = '#fa8c16';
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, 2 * Math.PI);
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 绘制机器人图标
    ctx.fillStyle = '#fff';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🤖', x, y);
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    // 如果没有 onMapClick 回调，说明这是预览模式，不处理点击
    if (!onMapClick) {
      return;
    }
    
    if (!canvasRef.current || !currentMap) {
      console.warn('Cannot handle map click: missing canvas or map data');
      return;
    }

    // 验证地图元数据
    if (!currentMap.origin || !currentMap.resolution || !currentMap.width || !currentMap.height) {
      console.error('Invalid map metadata:', currentMap);
      message.error('地图元数据不完整，无法进行坐标转换');
      return;
    }
    
    console.log('Map metadata:', {
      origin: currentMap.origin,
      resolution: currentMap.resolution,
      width: currentMap.width,
      height: currentMap.height
    });

    const rect = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // 获取画布实际尺寸
    const canvas = canvasRef.current;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // 获取显示尺寸与画布尺寸的比例
    const displayWidth = canvas.offsetWidth;
    const displayHeight = canvas.offsetHeight;
    const scaleX = canvasWidth / displayWidth;
    const scaleY = canvasHeight / displayHeight;
    
    // 转换点击坐标到画布坐标
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;
    
    // 计算自动缩放比例
    const autoScaleX = canvasWidth / (currentMap.width * currentMap.resolution);
    const autoScaleY = canvasHeight / (currentMap.height * currentMap.resolution);
    const autoScale = Math.min(autoScaleX, autoScaleY) * 0.8;
    
    const finalScale = scale * autoScale;
    
    // 计算地图在画布中的偏移
    const mapWidth = currentMap.width * currentMap.resolution * finalScale;
    const mapHeight = currentMap.height * currentMap.resolution * finalScale;
    const mapOffsetX = (canvasWidth - mapWidth) / 2 + offset.x;
    const mapOffsetY = (canvasHeight - mapHeight) / 2 + offset.y;
    
    // 计算点击位置相对于地图的坐标（画布像素）
    const relativeX = canvasX - mapOffsetX;
    const relativeY = canvasY - mapOffsetY;
    
    // 转换为世界坐标（米）
    // finalScale 是从米到画布像素的缩放比例
    // 所以 relative / finalScale 得到的是米
    const relativeWorldX = relativeX / finalScale;
    const relativeWorldY = relativeY / finalScale;
    
    // 加上 origin 得到绝对世界坐标
    // 注意：图像坐标系Y轴向下，世界坐标系Y轴向上，需要翻转Y坐标
    const worldX = currentMap.origin.x + relativeWorldX;
    const worldY = currentMap.origin.y + (currentMap.height * currentMap.resolution - relativeWorldY);

    console.log('=== 坐标转换详情 ===');
    console.log(`点击位置: display(${x.toFixed(1)}, ${y.toFixed(1)}) -> canvas(${canvasX.toFixed(1)}, ${canvasY.toFixed(1)})`);
    console.log(`地图偏移: mapOffset(${mapOffsetX.toFixed(1)}, ${mapOffsetY.toFixed(1)}), scale=${finalScale.toFixed(3)}`);
    console.log(`相对坐标: relativeCanvas(${relativeX.toFixed(1)}, ${relativeY.toFixed(1)}) -> relativeWorld(${relativeWorldX.toFixed(3)}, ${relativeWorldY.toFixed(3)}m)`);
    console.log(`世界坐标: world(${worldX.toFixed(3)}, ${worldY.toFixed(3)})`);
    console.log('==================');

    // 验证结果
    if (isNaN(worldX) || isNaN(worldY)) {
      console.error('Invalid world coordinates calculated');
      message.error('坐标转换失败，请重试');
      return;
    }

    onMapClick({ x: worldX, y: worldY });
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    // 修复preventDefault错误
    if (event.cancelable) {
      event.preventDefault();
    }
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.1, Math.min(5, prev * delta)));
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setOffset({
        x: event.clientX - dragStart.x,
        y: event.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(5, prev * 1.2));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(0.1, prev / 1.2));
  };

  const handleResetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleGetCurrentPosition = async () => {
    try {
      const data = await apiService.get('/templates/robot/current-position');
      if (data && data.position) {
        setLocalRobotPosition(data.position);
      }
      message.success('已获取当前机器人位置');
    } catch (error) {
      console.error('Failed to get current position:', error);
      message.error('获取当前位置失败');
    }
  };

  return (
    <div style={{ height, display: 'flex', flexDirection: 'column' }}>
      {/* 工具栏 */}
      {showMapSelector && (
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Select
            style={{ width: 200 }}
            placeholder="选择地图"
            value={selectedMapId}
            onChange={onMapChange}
            options={maps.map(map => ({ label: map.name, value: map.name }))}
          />
          
          <Space>
            <Button 
              icon={<EnvironmentOutlined />} 
              onClick={handleGetCurrentPosition}
              size="small"
            >
              获取当前位置
            </Button>
            <Button 
              icon={<ZoomOutOutlined />} 
              onClick={handleZoomOut}
              size="small"
            />
            <Button 
              icon={<ZoomInOutlined />} 
              onClick={handleZoomIn}
              size="small"
            />
            <Button 
              icon={<AimOutlined />} 
              onClick={handleResetView}
              size="small"
            >
              重置视图
            </Button>
          </Space>
        </div>
      )}

      {/* 地图画布 */}
      <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={parseInt(height) - (showMapSelector ? 40 : 0)}
          style={{ 
            width: '100%', 
            height: '100%', 
            cursor: isDragging ? 'grabbing' : onMapClick ? 'crosshair' : 'grab',
            backgroundColor: '#f5f5f5'
          }}
          onClick={handleCanvasClick}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
};

export default PGMMapViewer;