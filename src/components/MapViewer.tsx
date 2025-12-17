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
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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
              console.log('Active map from database:', activeMap.id);
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
          
          if (mapToLoad) {
            console.log('Active map from file system:', mapToLoad.id);
          }
        }
        
        if (!mapToLoad) {
          console.warn('No maps available');
          setLoading(false);
          return;
        }
        
        console.log('Loading map:', mapToLoad.name || mapToLoad.id);
        
        // 获取地图图像
        const imageResponse = await fetch(`/api/maps/${mapToLoad.id}/image`);
        const imageBlob = await imageResponse.blob();
        
        // 转换图像为地图数据
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = mapToLoad.width;
          canvas.height = mapToLoad.height;
          const ctx = canvas.getContext('2d');
          
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, mapToLoad.width, mapToLoad.height);
            const pixels = imageData.data;
            
            // 转换为地图数据格式
            const mapDataArray = [];
            for (let i = 0; i < pixels.length; i += 4) {
              const gray = pixels[i];
              let value = -1;
              if (gray > 250) value = 0;
              else if (gray < 10) value = 100;
              else if (gray > 200) value = 0;
              mapDataArray.push(value);
            }
            
            setMapData({
              info: {
                width: mapToLoad.width,
                height: mapToLoad.height,
                resolution: mapToLoad.resolution,
                origin: {
                  position: mapToLoad.origin
                }
              },
              data: mapDataArray
            });
            
            setLoading(false);
          }
        };
        
        img.onerror = () => {
          console.error('Failed to load map image');
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
    if (!canvasRef.current || !mapData || !containerRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height, resolution, origin } = mapData.info;
    
    // 设置canvas尺寸
    canvas.width = width;
    canvas.height = height;
    
    // 计算显示尺寸
    const containerHeight = containerRef.current.clientHeight;
    const mapHeightMeters = height * resolution;
    const calculatedScale = containerHeight / mapHeightMeters;
    const adjustedScale = calculatedScale * scale;
    
    const displayWidth = width * resolution * adjustedScale;
    const displayHeight = containerHeight;
    
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;
    canvas.style.left = `${offset.x}px`;
    canvas.style.top = `${offset.y}px`;
    
    // 清空画布
    ctx.clearRect(0, 0, width, height);
    
    // 绘制地图
    const imageData = ctx.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const value = mapData.data[i];
        
        let color = 205;
        if (value === 0) color = 255;
        else if (value === 100) color = 0;
        else if (value > 0 && value < 100) color = Math.floor(255 - (value / 100) * 255);
        
        const flipY = height - 1 - y;
        const idx = (flipY * width + x) * 4;
        imageData.data[idx] = color;
        imageData.data[idx + 1] = color;
        imageData.data[idx + 2] = color;
        imageData.data[idx + 3] = 255;
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    
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
      
      ctx.save();
      ctx.translate(robotX, canvasY);
      
      // 绘制机器人主体
      ctx.fillStyle = '#ff4d4f';
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, 2 * Math.PI);
      ctx.fill();
      
      // 绘制方向指示器
      ctx.strokeStyle = '#ff4d4f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();
      
      ctx.restore();
    }
  }, [mapData, navigationPoints, roadSegments, robotPosition, scale, offset]);

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
        height: '500px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <Spin tip="加载地图中..." />
      </div>
    );
  }

  if (!mapData) {
    return (
      <div style={{ 
        height: '500px', 
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
        height: '500px', 
        width: '100%',
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
          imageRendering: 'pixelated'
        }}
      />
    </div>
  );
};

export default MapViewer;
