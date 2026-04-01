/**
 * 路线预览可视化组件
 * 在Canvas上显示地图和规划路线
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Card, Spin, Empty, Button, Space, Tag, Tooltip, Slider, Select, message } from 'antd';
import {
  ZoomInOutlined, ZoomOutOutlined, ReloadOutlined,
  PlayCircleOutlined, EnvironmentOutlined, ArrowRightOutlined
} from '@ant-design/icons';
import { jobPlanningApi } from '../services/gpsMappingApi';

// 地图数据类型
interface MapPoint {
  x: number;
  y: number;
}

interface Road {
  id: string;
  name: string;
  type: string;
  points: MapPoint[];
}

interface Intersection {
  id: string;
  x: number;
  y: number;
  roadVId?: string;
  roadHId?: string;
  validQuadrants: number[];
}

interface TurnArc {
  id: string;
  intersectionId: string;
  quadrant: number;
  center: MapPoint;
  points: MapPoint[];
}

interface BeamPosition {
  id: string;
  name: string;
  row: string;
  col: number;
  center: MapPoint;
  boundaries: {
    north?: string;
    south?: string;
    east?: string;
    west?: string;
  };
  neighbors?: {
    top?: string;
    bottom?: string;
    left?: string;
    right?: string;
  };
}

interface Waypoint {
  x: number;
  y: number;
  yaw: number;
  sprayAction?: string;
}

interface RouteSegment {
  id: string;
  type: 'road' | 'turn_arc' | 'transit';
  roadId?: string;
  arcId?: string;
  beamId?: string;
  side?: string;
  sprayMode: 'left_only' | 'right_only' | 'both' | 'none';
  waypointCount: number;
  coordinates: Waypoint[];
}

interface PreviewData {
  beamSequence: string[];
  totalLength: number;
  estimatedTime: number;
  sprayLength: number;
  transitLength: number;
  segments: RouteSegment[];
}

interface RoutePreviewProps {
  beamPositionIds: string[];
  onRouteGenerated?: (route: PreviewData) => void;
  height?: number;
}

// 颜色配置
const COLORS = {
  background: '#1a1a2e',
  grid: '#2d2d44',
  road: '#4a4a6a',
  roadHighlight: '#6366f1',
  intersection: '#22c55e',
  turnArc: '#3b82f6',
  beamPosition: '#10b981',
  beamPositionSelected: '#f59e0b',
  supplyStation: '#ef4444',
  routeNone: '#6b7280',
  routeBoth: '#22c55e',
  routeLeft: '#3b82f6',
  routeRight: '#f59e0b',
  waypoint: '#ffffff',
  text: '#ffffff',
  textSecondary: '#9ca3af',
};

const RoutePreview: React.FC<RoutePreviewProps> = ({
  beamPositionIds,
  onRouteGenerated,
  height = 500
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 状态
  const [loading, setLoading] = useState(false);
  const [mapData, setMapData] = useState<{
    roads: Road[];
    intersections: Intersection[];
    turnArcs: TurnArc[];
    beamPositions: BeamPosition[];
    supplyStation: MapPoint;
  } | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [selectedBeamIds, setSelectedBeamIds] = useState<string[]>(beamPositionIds);

  // 视图状态
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [highlightSegment, setHighlightSegment] = useState<string | null>(null);

  // 加载地图数据
  useEffect(() => {
    loadMapData();
  }, []);

  // 当梁位选择变化时更新
  useEffect(() => {
    setSelectedBeamIds(beamPositionIds);
  }, [beamPositionIds]);

  // 加载地图数据
  const loadMapData = async () => {
    try {
      const response = await jobPlanningApi.getMapData();
      if (response.success) {
        setMapData(response.data);
      }
    } catch (error) {
      console.error('加载地图数据失败:', error);
      message.error('加载地图数据失败');
    }
  };

  // 生成路线预览
  const generatePreview = async () => {
    if (selectedBeamIds.length === 0) {
      message.warning('请选择至少一个梁位');
      return;
    }

    setLoading(true);
    try {
      const response = await jobPlanningApi.previewRoute(selectedBeamIds);
      if (response.success) {
        setPreviewData(response.data);
        onRouteGenerated?.(response.data);
        message.success('路线预览生成成功');
      } else {
        message.error(response.message || '生成路线失败');
      }
    } catch (error) {
      console.error('生成路线预览失败:', error);
      message.error('生成路线预览失败');
    } finally {
      setLoading(false);
    }
  };

  // 计算视图边界
  const calculateBounds = useCallback(() => {
    if (!mapData) return { minX: -50, maxX: 50, minY: -50, maxY: 50 };

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    // 道路点
    mapData.roads.forEach(road => {
      road.points.forEach(p => {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      });
    });

    // 交叉点
    mapData.intersections.forEach(inter => {
      minX = Math.min(minX, inter.x);
      maxX = Math.max(maxX, inter.x);
      minY = Math.min(minY, inter.y);
      maxY = Math.max(maxY, inter.y);
    });

    // 梁位
    mapData.beamPositions.forEach(bp => {
      minX = Math.min(minX, bp.center.x);
      maxX = Math.max(maxX, bp.center.x);
      minY = Math.min(minY, bp.center.y);
      maxY = Math.max(maxY, bp.center.y);
    });

    // 补给站
    minX = Math.min(minX, mapData.supplyStation.x);
    maxX = Math.max(maxX, mapData.supplyStation.x);
    minY = Math.min(minY, mapData.supplyStation.y);
    maxY = Math.max(maxY, mapData.supplyStation.y);

    // 边距
    const padding = 20;
    return {
      minX: minX - padding,
      maxX: maxX + padding,
      minY: minY - padding,
      maxY: maxY + padding
    };
  }, [mapData]);

  // 地图坐标转画布坐标
  const mapToCanvas = useCallback((point: MapPoint, canvas: HTMLCanvasElement) => {
    const bounds = calculateBounds();
    const mapWidth = bounds.maxX - bounds.minX;
    const mapHeight = bounds.maxY - bounds.minY;
    const scaleX = canvas.width / mapWidth;
    const scaleY = canvas.height / mapHeight;
    const baseScale = Math.min(scaleX, scaleY);

    const x = (point.x - bounds.minX) * baseScale * scale + offset.x;
    const y = canvas.height - (point.y - bounds.minY) * baseScale * scale + offset.y;

    return { x, y };
  }, [calculateBounds, scale, offset]);

  // 绘制地图
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清空画布
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制网格
    drawGrid(ctx, canvas);

    // 绘制道路
    mapData.roads.forEach(road => {
      drawRoad(ctx, canvas, road);
    });

    // 绘制转弯弧
    mapData.turnArcs.forEach(arc => {
      drawTurnArc(ctx, canvas, arc);
    });

    // 绘制交叉点
    mapData.intersections.forEach(inter => {
      drawIntersection(ctx, canvas, inter);
    });

    // 绘制梁位
    mapData.beamPositions.forEach(bp => {
      const isSelected = selectedBeamIds.includes(bp.id);
      drawBeamPosition(ctx, canvas, bp, isSelected);
    });

    // 绘制补给站
    drawSupplyStation(ctx, canvas, mapData.supplyStation);

    // 绘制路线
    if (previewData) {
      drawRoute(ctx, canvas, previewData);
    }
  }, [mapData, selectedBeamIds, previewData, mapToCanvas, scale, offset, highlightSegment]);

  // 绘制网格
  const drawGrid = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const bounds = calculateBounds();
    const gridSize = 10 * scale;

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;

    // 垂直线
    for (let x = bounds.minX; x <= bounds.maxX; x += 10) {
      const p1 = mapToCanvas({ x, y: bounds.minY }, canvas);
      const p2 = mapToCanvas({ x, y: bounds.maxY }, canvas);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    // 水平线
    for (let y = bounds.minY; y <= bounds.maxY; y += 10) {
      const p1 = mapToCanvas({ x: bounds.minX, y }, canvas);
      const p2 = mapToCanvas({ x: bounds.maxX, y }, canvas);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  };

  // 绘制道路
  const drawRoad = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, road: Road) => {
    if (road.points.length < 2) return;

    ctx.strokeStyle = COLORS.road;
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const start = mapToCanvas(road.points[0], canvas);
    ctx.moveTo(start.x, start.y);

    for (let i = 1; i < road.points.length; i++) {
      const p = mapToCanvas(road.points[i], canvas);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    // 高亮选中的道路
    if (previewData) {
      const isHighlighted = previewData.segments.some(
        seg => seg.roadId === road.id && seg.id === highlightSegment
      );
      if (isHighlighted) {
        ctx.strokeStyle = COLORS.roadHighlight;
        ctx.lineWidth = 4 * scale;
        ctx.beginPath();
        const s = mapToCanvas(road.points[0], canvas);
        ctx.moveTo(s.x, s.y);
        for (let i = 1; i < road.points.length; i++) {
          const p = mapToCanvas(road.points[i], canvas);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
    }
  };

  // 绘制转弯弧
  const drawTurnArc = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, arc: TurnArc) => {
    if (arc.points.length < 2) return;

    ctx.strokeStyle = COLORS.turnArc;
    ctx.lineWidth = 2 * scale;

    ctx.beginPath();
    const start = mapToCanvas(arc.points[0], canvas);
    ctx.moveTo(start.x, start.y);

    for (let i = 1; i < arc.points.length; i++) {
      const p = mapToCanvas(arc.points[i], canvas);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };

  // 绘制交叉点
  const drawIntersection = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, inter: Intersection) => {
    const p = mapToCanvas({ x: inter.x, y: inter.y }, canvas);

    ctx.fillStyle = COLORS.intersection;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5 * scale, 0, Math.PI * 2);
    ctx.fill();

    // 绘制有效象限
    if (inter.validQuadrants && inter.validQuadrants.length > 0) {
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      inter.validQuadrants.forEach(q => {
        const angles = [
          [0, Math.PI / 2],           // Q0: 右上
          [Math.PI / 2, Math.PI],     // Q1: 左上
          [Math.PI, Math.PI * 1.5],   // Q2: 左下
          [Math.PI * 1.5, Math.PI * 2] // Q3: 右下
        ];
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, 8 * scale, angles[q][0], angles[q][1]);
        ctx.closePath();
        ctx.fill();
      });
    }
  };

  // 绘制梁位
  const drawBeamPosition = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, bp: BeamPosition, isSelected: boolean) => {
    const p = mapToCanvas(bp.center, canvas);

    // 绘制梁位标记
    ctx.fillStyle = isSelected ? COLORS.beamPositionSelected : COLORS.beamPosition;
    ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(p.x, p.y, isSelected ? 12 * scale : 8 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 绘制梁位名称
    if (scale > 0.5) {
      ctx.fillStyle = COLORS.text;
      ctx.font = `${10 * scale}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bp.name, p.x, p.y);
    }
  };

  // 绘制补给站
  const drawSupplyStation = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, station: MapPoint) => {
    const p = mapToCanvas(station, canvas);

    // 绘制补给站标记
    ctx.fillStyle = COLORS.supplyStation;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    // 绘制三角形
    const size = 15 * scale;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - size);
    ctx.lineTo(p.x - size * 0.866, p.y + size * 0.5);
    ctx.lineTo(p.x + size * 0.866, p.y + size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 标签
    ctx.fillStyle = COLORS.text;
    ctx.font = `bold ${12 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('补给站', p.x, p.y + size + 15 * scale);
  };

  // 绘制路线
  const drawRoute = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, route: PreviewData) => {
    route.segments.forEach((segment, index) => {
      const color = {
        'none': COLORS.routeNone,
        'both': COLORS.routeBoth,
        'left_only': COLORS.routeLeft,
        'right_only': COLORS.routeRight
      }[segment.sprayMode] || COLORS.routeNone;

      const isHighlighted = segment.id === highlightSegment;
      ctx.strokeStyle = color;
      ctx.lineWidth = isHighlighted ? 5 * scale : 3 * scale;
      ctx.globalAlpha = isHighlighted ? 1 : 0.8;

      if (segment.coordinates.length < 2) return;

      ctx.beginPath();
      const start = mapToCanvas(segment.coordinates[0], canvas);
      ctx.moveTo(start.x, start.y);

      for (let i = 1; i < segment.coordinates.length; i++) {
        const p = mapToCanvas(segment.coordinates[i], canvas);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // 绘制航点
      segment.coordinates.forEach((wp, i) => {
        const p = mapToCanvas(wp, canvas);
        ctx.fillStyle = COLORS.waypoint;
        ctx.beginPath();
        ctx.arc(p.x, p.y, isHighlighted ? 4 * scale : 2 * scale, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.globalAlpha = 1;
    });

    // 绘制梁位顺序
    route.beamSequence.forEach((beamId, index) => {
      const bp = mapData?.beamPositions.find(b => b.id === beamId);
      if (bp) {
        const p = mapToCanvas(bp.center, canvas);
        ctx.fillStyle = COLORS.beamPositionSelected;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${12 * scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${index + 1}`, p.x, p.y);
      }
    });
  };

  // 初始化画布
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const container = containerRef.current;
      if (container) {
        canvas.width = container.clientWidth;
        canvas.height = height;
        draw();
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [height, draw]);

  // 重绘
  useEffect(() => {
    draw();
  }, [draw]);

  // 鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.1, Math.min(5, prev * delta)));
  };

  // 工具栏操作
  const handleZoomIn = () => setScale(prev => Math.min(5, prev * 1.2));
  const handleZoomOut = () => setScale(prev => Math.max(0.1, prev / 1.2));
  const handleReset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <Card
      title={
        <Space>
          <EnvironmentOutlined />
          <span>路线预览</span>
          {previewData && (
            <Tag color="blue">{previewData.beamSequence.length}个梁位</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button.Group>
            <Tooltip title="放大">
              <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} size="small" />
            </Tooltip>
            <Tooltip title="缩小">
              <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} size="small" />
            </Tooltip>
            <Tooltip title="重置视图">
              <Button icon={<ReloadOutlined />} onClick={handleReset} size="small" />
            </Tooltip>
          </Button.Group>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={generatePreview}
            loading={loading}
            disabled={selectedBeamIds.length === 0}
            size="small"
          >
            生成预览
          </Button>
        </Space>
      }
    >
      <Spin spinning={loading}>
        {!mapData ? (
          <Empty description="无地图数据，请先完成GPS建图" />
        ) : (
          <div
            ref={containerRef}
            style={{ position: 'relative', cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              style={{ display: 'block', width: '100%', height }}
            />

            {/* 图例 */}
            <div style={{
              position: 'absolute',
              bottom: 10,
              left: 10,
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '8px 12px',
              borderRadius: 4,
              fontSize: 12
            }}>
              <div style={{ color: COLORS.text, marginBottom: 4 }}>
                <strong>喷淋模式：</strong>
              </div>
              <div style={{ display: 'flex', gap: 8, color: COLORS.text }}>
                <span><span style={{ color: COLORS.routeBoth }}>●</span> 双侧</span>
                <span><span style={{ color: COLORS.routeLeft }}>●</span> 左侧</span>
                <span><span style={{ color: COLORS.routeRight }}>●</span> 右侧</span>
                <span><span style={{ color: COLORS.routeNone }}>●</span> 无</span>
              </div>
            </div>

            {/* 缩放比例 */}
            <div style={{
              position: 'absolute',
              top: 10,
              right: 10,
              background: 'rgba(0, 0, 0, 0.7)',
              padding: '4px 8px',
              borderRadius: 4,
              color: COLORS.text,
              fontSize: 12
            }}>
              缩放: {(scale * 100).toFixed(0)}%
            </div>

            {/* 统计信息 */}
            {previewData && (
              <div style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(0, 0, 0, 0.7)',
                padding: '8px 12px',
                borderRadius: 4,
                fontSize: 12
              }}>
                <div style={{ color: COLORS.text }}>
                  <strong>总距离：</strong>{previewData.totalLength.toFixed(1)}m
                </div>
                <div style={{ color: COLORS.text }}>
                  <strong>预估时间：</strong>{Math.ceil(previewData.estimatedTime / 60)}分钟
                </div>
                <div style={{ color: COLORS.text }}>
                  <strong>喷淋距离：</strong>{previewData.sprayLength.toFixed(1)}m
                </div>
                <div style={{ color: COLORS.text }}>
                  <strong>过渡距离：</strong>{previewData.transitLength.toFixed(1)}m
                </div>
              </div>
            )}
          </div>
        )}
      </Spin>
    </Card>
  );
};

export default RoutePreview;
