/**
 * 梁位选择器组件 - 简化版
 * 解决无限循环问题
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Tag, Space, Button, Empty, Spin, message, Tooltip, Badge, Row, Col, Statistic } from 'antd';
import { EnvironmentOutlined, ReloadOutlined, CheckOutlined, ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined } from '@ant-design/icons';
import { gpsMappingApi } from '../services/gpsMappingApi';

interface BeamPosition {
  id: string;
  name: string;
  center: { x: number; y: number };
  corner_intersections?: string[];
}

interface RoadPoint {
  mapXy?: { x: number; y: number };
  map_xy?: { x: number; y: number };
}

interface Road {
  id: string;
  name: string;
  type: 'longitudinal' | 'horizontal';
  params: { preferredWidth: number };
  points: RoadPoint[];
}

interface Intersection {
  id: string;
  center: { mapXy?: { x: number; y: number }; map_xy?: { x: number; y: number } };
}

function getMapXy(center: { mapXy?: { x: number; y: number }; map_xy?: { x: number; y: number } }): { x: number; y: number } | null {
  return center.mapXy || center.map_xy || null;
}

function getRoadPointMapXy(point: RoadPoint): { x: number; y: number } | null {
  return point.mapXy || point.map_xy || null;
}

// 点是否在多边形内部（射线法）
function isPointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    if (((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

interface Props {
  value?: string[];
  onChange?: (value: string[]) => void;
  onPositionsChange?: (positions: BeamPosition[]) => void;
  mode?: 'multiple' | 'single';
  maxSelect?: number;
  disabled?: boolean;
  showMap?: boolean;
}

const BeamPositionSelector: React.FC<Props> = ({
  value: externalValue,
  onChange,
  onPositionsChange,
  mode = 'multiple',
  maxSelect,
  disabled = false,
  showMap = true
}) => {
  // 内部状态：当外部未提供value时使用
  const [internalValue, setInternalValue] = useState<string[]>([]);
  // 当外部提供value时使用外部值，否则使用内部状态
  const value = externalValue !== undefined ? externalValue : internalValue;

  const [beamPositions, setBeamPositions] = useState<BeamPosition[]>([]);
  const [roads, setRoads] = useState<Road[]>([]);
  const [intersections, setIntersections] = useState<Intersection[]>([]);
  const [loading, setLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 用 ref 存储最新值，避免重绘循环
  const valueRef = useRef(value);
  const onPositionsChangeRef = useRef(onPositionsChange);

  // 同步 refs
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onPositionsChangeRef.current = onPositionsChange;
  }, [onPositionsChange]);

  // 加载数据
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [beamRes, roadsRes, interRes] = await Promise.all([
          gpsMappingApi.getBeamPositions(),
          gpsMappingApi.getRoads(),
          gpsMappingApi.getIntersections()
        ]);

        console.log('[BeamPositionSelector] API响应:', {
          beam: beamRes.success ? beamRes.data?.length : 'failed',
          roads: roadsRes.success ? roadsRes.data?.length : 'failed',
          intersections: interRes.success ? interRes.data?.length : 'failed'
        });

        if (beamRes.success && beamRes.data) {
          console.log('[BeamPositionSelector] 第一个梁位数据:', JSON.stringify(beamRes.data[0], null, 2));
          setBeamPositions(beamRes.data);
        }
        if (roadsRes.success && roadsRes.data) setRoads(roadsRes.data);
        if (interRes.success && interRes.data) {
          // 检查交叉点数据格式
          if (interRes.data.length > 0) {
            console.log('[BeamPositionSelector] 第一个交叉点:', JSON.stringify(interRes.data[0], null, 2));
            console.log('[BeamPositionSelector] 交叉点center格式:',
              interRes.data[0].center?.mapXy ? 'mapXy' :
              interRes.data[0].center?.map_xy ? 'map_xy' : 'unknown');
          }
          setIntersections(interRes.data);
        }

        // 检查梁位与交叉点的匹配
        if (beamRes.data && interRes.data && beamRes.data.length > 0) {
          const beam = beamRes.data[0];
          if (beam.corner_intersections) {
            console.log('[BeamPositionSelector] 梁位角点ID:', beam.corner_intersections);
            const matchedIntersections = beam.corner_intersections.map((id: string) => {
              const found = interRes.data.find((i: any) => i.id === id);
              return { id, found: !!found, center: found?.center };
            });
            console.log('[BeamPositionSelector] 匹配结果:', matchedIntersections);
          }
        }
      } catch (e) {
        console.error('Load data error:', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // 绘制地图
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 网格
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 1;
    const gridSize = 50 * scale;
    for (let x = offset.x % gridSize; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = offset.y % gridSize; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    const originScreenX = canvas.width / 2 + offset.x;
    const originScreenY = canvas.height / 2 + offset.y;

    // 绘制道路
    roads.forEach(road => {
      if (road.points.length < 2) return;
      const pts: { x: number; y: number }[] = [];
      for (const p of road.points) {
        const xy = getRoadPointMapXy(p);
        if (xy) pts.push({ x: originScreenX + xy.x * scale, y: originScreenY - xy.y * scale });
      }
      if (pts.length < 2) return;

      ctx.strokeStyle = '#b7eb8f';
      ctx.lineWidth = (road.params?.preferredWidth || 1.4) * scale * 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();

      ctx.strokeStyle = road.type === 'longitudinal' ? '#1890ff' : '#52c41a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.stroke();
    });

    // 绘制交叉点
    intersections.forEach(inter => {
      const xy = getMapXy(inter.center);
      if (!xy) return;
      ctx.fillStyle = '#722ed1';
      ctx.beginPath();
      ctx.arc(originScreenX + xy.x * scale, originScreenY - xy.y * scale, 2 * scale, 0, 2 * Math.PI);
      ctx.fill();
    });

    // 绘制补给站
    ctx.fillStyle = '#faad14';
    ctx.beginPath();
    ctx.arc(originScreenX, originScreenY, 3.3 * scale, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#d48806';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#d48806';
    ctx.font = `bold ${10 * scale}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('补给站', originScreenX, originScreenY - 8 * scale);

    // 绘制选中梁位
    const selectedIds = valueRef.current;
    beamPositions.filter(b => selectedIds.includes(b.id)).forEach(beam => {
      if (beam.corner_intersections && beam.corner_intersections.length >= 4) {
        const corners: { x: number; y: number }[] = [];
        for (const id of beam.corner_intersections) {
          const inter = intersections.find(i => i.id === id);
          const xy = inter ? getMapXy(inter.center) : null;
          if (xy) corners.push({ x: originScreenX + xy.x * scale, y: originScreenY - xy.y * scale });
        }
        if (corners.length >= 4) {
          const minX = Math.min(...corners.map(p => p.x));
          const maxX = Math.max(...corners.map(p => p.x));
          const minY = Math.min(...corners.map(p => p.y));
          const maxY = Math.max(...corners.map(p => p.y));
          const centerX = (minX + maxX) / 2;
          const centerY = (minY + maxY) / 2;

          const sortX = corners.reduce((s, p) => s + p.x, 0) / corners.length;
          const sortY = corners.reduce((s, p) => s + p.y, 0) / corners.length;
          const sorted = [...corners].sort((a, b) => Math.atan2(a.y - sortY, a.x - sortX) - Math.atan2(b.y - sortY, b.x - sortX));

          ctx.shadowColor = '#52c41a';
          ctx.shadowBlur = 15 * scale;
          ctx.fillStyle = 'rgba(82, 196, 26, 0.25)';
          ctx.beginPath();
          sorted.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#52c41a';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#237804';
          ctx.font = `bold ${14 * scale}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(beam.name, centerX, centerY);
          ctx.textBaseline = 'alphabetic';

          // 对勾绘制在梁位中心，尺寸缩小一半
          ctx.fillStyle = '#52c41a';
          ctx.beginPath();
          ctx.arc(centerX, centerY - 20 * scale, 4 * scale, 0, 2 * Math.PI);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${6 * scale}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('✓', centerX, centerY - 20 * scale);
          ctx.textBaseline = 'alphabetic';
        } else {
          drawFallback(ctx, beam, originScreenX, originScreenY, scale);
        }
      } else {
        drawFallback(ctx, beam, originScreenX, originScreenY, scale);
      }
    });
  }, [beamPositions, roads, intersections, scale, offset]);

  const drawFallback = (ctx: CanvasRenderingContext2D, beam: BeamPosition, ox: number, oy: number, s: number) => {
    const sx = ox + beam.center.x * s;
    const sy = oy - beam.center.y * s;
    ctx.shadowColor = '#52c41a';
    ctx.shadowBlur = 15 * s;
    ctx.fillStyle = 'rgba(82, 196, 26, 0.25)';
    ctx.fillRect(sx - 20 * s, sy - 30 * s, 40 * s, 60 * s);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#52c41a';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(sx - 20 * s, sy - 30 * s, 40 * s, 60 * s);
    ctx.fillStyle = '#237804';
    ctx.font = `bold ${14 * s}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(beam.name, sx, sy);
    ctx.textBaseline = 'alphabetic';
    // 对勾绘制在梁位中心上方，尺寸缩小一半
    ctx.fillStyle = '#52c41a';
    ctx.beginPath();
    ctx.arc(sx, sy - 20 * s, 4 * s, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${6 * s}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✓', sx, sy - 20 * s);
    ctx.textBaseline = 'alphabetic';
  };

  useEffect(() => {
    if (showMap) drawMap();
  }, [showMap, drawMap, value]);

  // 选择处理
  const handleSelect = (id: string) => {
    if (disabled) return;
    let newValue: string[];
    if (mode === 'multiple') {
      if (valueRef.current.includes(id)) {
        newValue = valueRef.current.filter(x => x !== id);
      } else {
        if (maxSelect && valueRef.current.length >= maxSelect) {
          message.warning(`最多选择 ${maxSelect} 个`);
          return;
        }
        newValue = [...valueRef.current, id];
      }
    } else {
      newValue = valueRef.current.includes(id) ? [] : [id];
    }
    valueRef.current = newValue;
    // 更新内部状态（当外部未控制时）
    if (externalValue === undefined) {
      setInternalValue(newValue);
    }
    drawMap();
    onChange?.(newValue);
    // 通知父组件选中的梁位详情
    const selectedBeams = beamPositions.filter(b => newValue.includes(b.id));
    onPositionsChangeRef.current?.(selectedBeams);
  };

  const handleSelectAll = () => {
    if (maxSelect) {
      message.warning(`最多选择 ${maxSelect} 个`);
      return;
    }
    const newValue = beamPositions.map(b => b.id);
    valueRef.current = newValue;
    // 更新内部状态（当外部未控制时）
    if (externalValue === undefined) {
      setInternalValue(newValue);
    }
    drawMap();
    onChange?.(newValue);
    onPositionsChangeRef.current?.(beamPositions);
  };

  const handleClear = () => {
    valueRef.current = [];
    // 更新内部状态（当外部未控制时）
    if (externalValue === undefined) {
      setInternalValue([]);
    }
    drawMap();
    onChange?.([]);
    onPositionsChangeRef.current?.([]);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleWheel = (e: React.WheelEvent) => {
    setScale(prev => Math.max(0.5, Math.min(3, prev * (e.deltaY > 0 ? 0.9 : 1.1))));
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current || beamPositions.length === 0) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const originScreenX = canvas.width / 2 + offset.x;
    const originScreenY = canvas.height / 2 + offset.y;
    const clickPoint = { x: clickX, y: clickY };

    for (const beam of beamPositions) {
      if (beam.corner_intersections && beam.corner_intersections.length >= 4) {
        const corners: { x: number; y: number }[] = [];
        for (const id of beam.corner_intersections) {
          const inter = intersections.find(i => i.id === id);
          const xy = inter ? getMapXy(inter.center) : null;
          if (xy) corners.push({ x: originScreenX + xy.x * scale, y: originScreenY - xy.y * scale });
        }
        if (corners.length >= 4) {
          // 按角度排序角点，形成正确顺序的多边形
          const sortX = corners.reduce((s, p) => s + p.x, 0) / corners.length;
          const sortY = corners.reduce((s, p) => s + p.y, 0) / corners.length;
          const sortedCorners = [...corners].sort((a, b) =>
            Math.atan2(a.y - sortY, a.x - sortX) - Math.atan2(b.y - sortY, b.x - sortX)
          );

          // 使用多边形点检测
          if (isPointInPolygon(clickPoint, sortedCorners)) {
            handleSelect(beam.id);
            return;
          }
        }
      } else {
        // 回退到矩形检测
        const sx = originScreenX + beam.center.x * scale;
        const sy = originScreenY - beam.center.y * scale;
        if (clickX >= sx - 20 * scale && clickX <= sx + 20 * scale && clickY >= sy - 30 * scale && clickY <= sy + 30 * scale) {
          handleSelect(beam.id);
          return;
        }
      }
    }
  };

  const selectedBeams = beamPositions.filter(b => value.includes(b.id));

  if (loading) return <Card size="small"><Spin /></Card>;

  return (
    <div>
      {showMap && (
        <Card size="small" title={<Space><EnvironmentOutlined /><span>梁场地图</span><Badge count={selectedBeams.length} style={{ backgroundColor: '#52c41a' }} /></Space>}
          extra={<Space>
            <Tooltip title="放大"><Button icon={<ZoomInOutlined />} onClick={() => setScale(p => Math.min(p * 1.2, 3))} size="small" /></Tooltip>
            <Tooltip title="缩小"><Button icon={<ZoomOutOutlined />} onClick={() => setScale(p => Math.max(p / 1.2, 0.5))} size="small" /></Tooltip>
            <Tooltip title="重置"><Button icon={<FullscreenOutlined />} onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }} size="small" /></Tooltip>
          </Space>} style={{ marginBottom: 8 }}>
          <div style={{ marginBottom: 8, display: 'flex', gap: 16, fontSize: 12 }}>
            <Space><div style={{ width: 20, height: 4, background: '#1890ff', borderRadius: 2 }} /><span>纵向道路</span></Space>
            <Space><div style={{ width: 20, height: 4, background: '#52c41a', borderRadius: 2 }} /><span>横向道路</span></Space>
            <Space><div style={{ width: 8, height: 8, background: '#faad14', borderRadius: '50%' }} /><span>补给站</span></Space>
            <Space><div style={{ width: 16, height: 24, background: 'rgba(82, 196, 26, 0.25)', border: '2px solid #52c41a', borderRadius: 2 }} /><span>已选梁位</span></Space>
          </div>
          <div style={{ width: '100%', height: 400, border: '1px solid #d9d9d9', borderRadius: 4, overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab', background: '#fafafa', position: 'relative' }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel} onClick={handleCanvasClick}>
            <canvas ref={canvasRef} style={{ position: 'absolute', top: 0, left: 0 }} />
            {beamPositions.length === 0 && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#999', textAlign: 'center' }}>
                <EnvironmentOutlined style={{ fontSize: 32, marginBottom: 8 }} />
                <div>暂无梁位数据</div>
              </div>
            )}
          </div>
          <div style={{ marginTop: 8, textAlign: 'center', color: '#666', fontSize: 12 }}>滚轮缩放 | 拖拽移动</div>
        </Card>
      )}

      <Card size="small" title={<Space><EnvironmentOutlined /><span>梁位列表</span>{maxSelect && <Tag color="orange">最多 {maxSelect} 个</Tag>}</Space>}
        extra={<Space>
          <Tooltip title="刷新"><Button type="text" icon={<ReloadOutlined />} onClick={() => { loadBeamPositions(); loadRoads(); loadIntersections(); }} size="small" /></Tooltip>
          {mode === 'multiple' && beamPositions.length > 0 && <Button size="small" onClick={handleSelectAll} disabled={disabled}>全选</Button>}
          {selectedBeams.length > 0 && <Button size="small" onClick={handleClear} disabled={disabled}>清空</Button>}
        </Space>}>
        {beamPositions.length === 0 ? (
          <Empty description="暂无梁位数据" image={Empty.PRESENTED_IMAGE_SIMPLE}><Button type="primary" href="/gps-mapping">前往GPS建图</Button></Empty>
        ) : (
          <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {beamPositions.map(beam => {
              const isSelected = value.includes(beam.id);
              return (
                <div key={beam.id} onClick={() => handleSelect(beam.id)}
                  style={{ cursor: disabled ? 'not-allowed' : 'pointer', background: isSelected ? '#f6ffed' : 'transparent', border: isSelected ? '2px solid #52c41a' : '1px solid #d9d9d9', borderRadius: 6, padding: '8px 12px', textAlign: 'center', opacity: disabled ? 0.5 : 1, transition: 'all 0.2s', boxShadow: isSelected ? '0 2px 8px rgba(82,196,26,0.3)' : 'none' }}
                  onMouseEnter={e => { if (!isSelected && !disabled) { e.currentTarget.style.borderColor = '#40a9ff'; e.currentTarget.style.background = '#e6f7ff'; } }}
                  onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = '#d9d9d9'; e.currentTarget.style.background = 'transparent'; } }}>
                  {isSelected ? <CheckOutlined style={{ color: '#52c41a', fontSize: 16 }} /> : <EnvironmentOutlined style={{ color: '#999', fontSize: 16 }} />}
                  <div style={{ fontSize: 13, marginTop: 4, fontWeight: isSelected ? 'bold' : 'normal', color: isSelected ? '#237804' : 'inherit' }}>{beam.name}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {selectedBeams.length > 0 && (
        <Card size="small" style={{ marginTop: 8 }}>
          <Row gutter={16}>
            <Col span={6}><Statistic title="已选梁位" value={selectedBeams.length} suffix={`/ ${beamPositions.length}`} valueStyle={{ color: '#52c41a' }} /></Col>
            <Col span={18}>
              <div style={{ marginTop: 16, marginBottom: 8, color: '#666', fontSize: 12 }}>点击梁位编号可取消选择：</div>
              <div style={{ maxHeight: 80, overflowY: 'auto' }}>
                <Space wrap size={[4, 4]}>
                  {selectedBeams.map(beam => (
                    <Tag key={beam.id} closable={!disabled} onClose={e => { e.preventDefault(); handleSelect(beam.id); }} onClick={() => handleSelect(beam.id)} color="green" style={{ cursor: 'pointer', margin: '2px 4px', padding: '2px 8px', fontSize: 13 }}>{beam.name}</Tag>
                  ))}
                </Space>
              </div>
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );

  async function loadBeamPositions() {
    try {
      const res = await gpsMappingApi.getBeamPositions();
      if (res.success && res.data) setBeamPositions(res.data);
    } catch (e) { console.log('No beam positions'); }
  }
  async function loadRoads() {
    try {
      const res = await gpsMappingApi.getRoads();
      if (res.success && res.data) setRoads(res.data);
    } catch (e) { console.log('No roads'); }
  }
  async function loadIntersections() {
    try {
      const res = await gpsMappingApi.getIntersections();
      if (res.success && res.data) setIntersections(res.data);
    } catch (e) { console.log('No intersections'); }
  }
};

export default BeamPositionSelector;
