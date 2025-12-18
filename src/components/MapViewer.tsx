import React, { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';

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
}

interface MapViewerProps {
  navigationPoints: NavigationPoint[];
  roadSegments?: RoadSegment[];
  onMapClick?: (position: { x: number; y: number }) => void;
  robotPosition?: { x: number; y: number };
  center?: [number, number];
  zoom?: number;
  onMapLoaded?: (mapInfo: { origin: { x: number; y: number; z: number }; resolution: number; width: number; height: number }) => void;
}

interface MapData {
  info: {
    width: number;
    height: number;
    resolution: number;
    origin: {
      position: { x: number; y: number; z: number };
    };
  };
  data: number[];
}

const MapViewer: React.FC<MapViewerProps> = ({
  navigationPoints,
  roadSegments = [],
  onMapClick,
  robotPosition,
  onMapLoaded,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // 监听容器尺寸变化
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // 加载默认地图
  useEffect(() => {
    const loadDefaultMap = async () => {
      try {
        setLoading(true);
        
        let mapToLoad = null;
        
        // 首先尝试从数据库获取默认地图
        try {
          const activeResponse = await fetch('/api/maps/active-local');
          if (activeResponse.ok) {
            const activeMap = await activeResponse.json();
            if (activeMap && activeMap.id) {
              mapToLoad = activeMap;
            }
          }
        } catch (error) {
          console.warn('Failed to fetch active map from database:', error);
        }
        
        // 如果数据库中没有，从地图列表获取
        if (!mapToLoad) {
          const response = await fetch('/api/maps/scan-local');
          const maps = await response.json();
          
          // 查找激活的地图
          const activeMap = maps.find((m: any) => m.isActive);
          mapToLoad = activeMap || maps[0];
        }
        
        if (!mapToLoad) {
          console.warn('No maps available');
          setLoading(false);
          return;
        }
        
        // 获取地图图像
        const imageResponse = await fetch(`/api/maps/${mapToLoad.id}/image`);
        if (!imageResponse.ok) {
          console.error('Failed to fetch map image:', imageResponse.status);
          setLoading(false);
          return;
        }
        
        const imageBlob = await imageResponse.blob();
        
        // 转换图像为地图数据
        const img = new Image();
        img.onload = () => {
          
          const canvas = document.createElement('canvas');
          canvas.width = mapToLoad.width || img.width;
          canvas.height = mapToLoad.height || img.height;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imageData.data;
            
            // 转换为地图数据格式
            const mapDataArray = [];
            for (let i = 0; i < pixels.length; i += 4) {
              const gray = pixels[i];
              let value = -1; // 未知区域
              if (gray > 250) value = 0; // 自由空间（白色）
              else if (gray < 10) value = 100; // 障碍物（黑色）
              else if (gray > 200) value = 0; // 接近白色也视为自由空间
              mapDataArray.push(value);
            }
            
            const mapInfo = {
              info: {
                width: canvas.width,
                height: canvas.height,
                resolution: mapToLoad.resolution || 0.05,
                origin: {
                  position: {
                    x: mapToLoad.origin?.x || 0,
                    y: mapToLoad.origin?.y || 0,
                    z: mapToLoad.origin?.z || 0
                  }
                }
              },
              data: mapDataArray
            };
            
            setMapData(mapInfo);
            
            // 通知父组件地图已加载
            if (onMapLoaded) {
              onMapLoaded({
                origin: {
                  x: mapInfo.info.origin.position.x,
                  y: mapInfo.info.origin.position.y,
                  z: mapInfo.info.origin.position.z
                },
                resolution: mapInfo.info.resolution,
                width: mapInfo.info.width,
                height: mapInfo.info.height
              });
            }
            
            setLoading(false);
          }
        };
        
        img.onerror = (error) => {
          console.error('Failed to load map image:', error);
          setLoading(false);
        };
        
        img.src = URL.createObjectURL(imageBlob);
      } catch (error) {
        console.error('Failed to load map:', error);
        setLoading(false);
      }
    };
    
    loadDefaultMap();
  }, []);

  // 绘制地图
  useEffect(() => {
    if (!canvasRef.current || !mapData || !containerRef.current) {
      console.log('Canvas render skipped:', {
        hasCanvas: !!canvasRef.current,
        hasMapData: !!mapData,
        hasContainer: !!containerRef.current
      });
      return;
    }
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Failed to get 2D context');
      return;
    }
    
    // 检查容器尺寸
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    
    if (containerWidth === 0 || containerHeight === 0) {
      console.warn('Container has zero size, waiting...', { containerWidth, containerHeight });
      return;
    }
    
    const { width, height, resolution, origin } = mapData.info;
    
    // 设置 Canvas 内部尺寸 = 地图原始像素尺寸
    canvas.width = width;
    canvas.height = height;
    
    const widthRatio = containerWidth / width;
    const heightRatio = containerHeight / height;
    const baseScale = Math.min(widthRatio, heightRatio);
    const adjustedScale = baseScale * scale;
    
    const displayWidth = width * adjustedScale;
    const displayHeight = height * adjustedScale;
    
    // 居中显示
    const centerX = (containerWidth - displayWidth) / 2;
    const centerY = (containerHeight - displayHeight) / 2;
    
    // 设置 Canvas CSS 显示尺寸
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.style.left = `${centerX + offset.x}px`;
    canvas.style.top = `${centerY + offset.y}px`;
    
    // 创建临时 Canvas 用于绘制原始地图数据
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;
    
    // 在临时 Canvas 上绘制地图数据
    const imageData = tempCtx.createImageData(width, height);
    let whitePixels = 0, blackPixels = 0, grayPixels = 0, unknownPixels = 0;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const value = mapData.data[i];
        
        let color = 205; // 未知区域（灰色）
        if (value === 0) {
          color = 255; // 空闲区域（白色）
          whitePixels++;
        } else if (value === 100) {
          color = 0; // 障碍物（黑色）
          blackPixels++;
        } else if (value === -1) {
          color = 205; // 未知区域
          unknownPixels++;
        } else if (value > 0 && value < 100) {
          color = Math.floor(255 - (value / 100) * 255);
          grayPixels++;
        }
        
        const flipY = height - 1 - y;
        const idx = (flipY * width + x) * 4;
        imageData.data[idx] = color;
        imageData.data[idx + 1] = color;
        imageData.data[idx + 2] = color;
        imageData.data[idx + 3] = 255;
      }
    }
    
    tempCtx.putImageData(imageData, 0, 0);
    
    // 清空主 Canvas
    ctx.clearRect(0, 0, width, height);
    
    // 将临时 Canvas 的内容绘制到主 Canvas（浏览器会自动处理 CSS 缩放）
    ctx.drawImage(tempCanvas, 0, 0);
    
    // 绘制导航点
    navigationPoints.forEach(point => {
      const robotX = (point.position.x - origin.position.x) / resolution;
      const robotY = (point.position.y - origin.position.y) / resolution;
      const canvasY = height - 1 - robotY;
      
      ctx.save();
      ctx.translate(robotX, canvasY);
      
      // 绘制点
      const colors: Record<string, string> = {
        start: '#52c41a',
        waypoint: '#1890ff',
        end: '#ff4d4f',
      };
      ctx.fillStyle = colors[point.type] || '#999';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.restore();
    });
    
    // 绘制路径
    if (roadSegments.length > 0) {
      ctx.strokeStyle = '#1890ff';
      ctx.lineWidth = 2;
      
      roadSegments.forEach(segment => {
        const startPoint = navigationPoints.find(p => p.id === segment.startNavPointId);
        const endPoint = navigationPoints.find(p => p.id === segment.endNavPointId);
        
        if (startPoint && endPoint) {
          const startX = (startPoint.position.x - origin.position.x) / resolution;
          const startY = (startPoint.position.y - origin.position.y) / resolution;
          const endX = (endPoint.position.x - origin.position.x) / resolution;
          const endY = (endPoint.position.y - origin.position.y) / resolution;
          
          ctx.beginPath();
          ctx.moveTo(startX, height - 1 - startY);
          ctx.lineTo(endX, height - 1 - endY);
          ctx.stroke();
        }
      });
    }
    
    // 绘制机器人
    if (robotPosition) {
      const robotX = (robotPosition.x - origin.position.x) / resolution;
      const robotY = (robotPosition.y - origin.position.y) / resolution;
      const canvasY = height - 1 - robotY;
      
      // 检查机器人是否在地图范围内
      if (robotX >= 0 && robotX < width && robotY >= 0 && robotY < height) {
        ctx.save();
        ctx.translate(robotX, canvasY);
        
        // 绘制机器人圆圈
        ctx.fillStyle = '#ff4d4f';
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, 2 * Math.PI);
        ctx.fill();
        
        // 绘制外圈（深色边框）
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, 2 * Math.PI);
        ctx.stroke();
        
        // 绘制方向箭头（深蓝色）
        ctx.strokeStyle = '#1890ff';
        ctx.fillStyle = '#1890ff';
        ctx.lineWidth = 2.5;
        
        // 箭头主线
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(12, 0);
        ctx.stroke();
        
        // 箭头头部
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(9, -3);
        ctx.lineTo(9, 3);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
      } else {
        console.warn('Robot position out of map bounds:', { robotX, robotY, width, height });
      }
    }
  }, [mapData, navigationPoints, roadSegments, robotPosition, scale, offset, containerSize]);

  // 鼠标事件处理
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
  
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.1, Math.min(5, prev * delta)));
  };

  if (loading) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <Spin size="large">加载地图中...</Spin>
      </div>
    );
  }

  if (!mapData) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#999'
      }}>
        无可用地图
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      style={{ 
        height: '100%', 
        width: '100%',
        border: '1px solid #d9d9d9',
        borderRadius: '4px',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'grab',
        background: 'transparent',
        position: 'relative',
        touchAction: 'none'
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
          zIndex: 10,
          imageRendering: 'pixelated'
        }}
      />
    </div>
  );
};

export default MapViewer;
