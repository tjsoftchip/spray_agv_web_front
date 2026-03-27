/**
 * 梁位选择器组件
 * 按照文档 web-gps-mapping-design.md 设计实现
 * 
 * 功能：
 * - 从GPS建图数据获取梁位列表
 * - 地图视图显示梁位位置
 * - 点击选择/取消选择梁位
 * - 显示已选梁位列表
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Card, Tag, Space, Button, List, Empty, Spin, message, Tooltip,
  Badge, Row, Col, Statistic, Divider
} from 'antd';
import {
  EnvironmentOutlined, ReloadOutlined, CheckOutlined,
  ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined
} from '@ant-design/icons';
import { gpsMappingApi } from '../services/gpsMappingApi';

// 梁位数据类型（与GPS建图数据结构一致）
interface BeamPosition {
  id: string;
  name: string;
  row: string;
  col: number;
  center: { x: number; y: number };
  boundaries: {
    north?: string;
    south?: string;
    east?: string;
    west?: string;
  };
  corner_intersections?: string[];
  crossPoints?: string[];
  neighbors?: {
    left?: string;
    right?: string;
    top?: string;
    bottom?: string;
  };
}

interface BeamPositionSelectorProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  onPositionsChange?: (positions: BeamPosition[]) => void;
  mode?: 'multiple' | 'single';
  maxSelect?: number;
  disabled?: boolean;
  showMap?: boolean;
}

const BeamPositionSelector: React.FC<BeamPositionSelectorProps> = ({
  value = [],
  onChange,
  onPositionsChange,
  mode = 'multiple',
  maxSelect,
  disabled = false,
  showMap = true
}) => {
  const [beamPositions, setBeamPositions] = useState<BeamPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBeams, setSelectedBeams] = useState<BeamPosition[]>([]);

  // 地图视图
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 加载梁位数据
  useEffect(() => {
    loadBeamPositions();
  }, []);

  // 同步选中状态
  useEffect(() => {
    if (value.length > 0 && beamPositions.length > 0) {
      const selected = beamPositions.filter(b => value.includes(b.id));
      setSelectedBeams(selected);
    } else {
      setSelectedBeams([]);
    }
  }, [value, beamPositions]);

  // 通知父组件
  useEffect(() => {
    onPositionsChange?.(selectedBeams);
  }, [selectedBeams]);

  // 绘制地图
  useEffect(() => {
    if (showMap) {
      drawMap();
    }
  }, [beamPositions, selectedBeams, scale, offset]);

  const loadBeamPositions = async () => {
    setLoading(true);
    try {
      // 获取最新的GPS建图数据
      const response = await gpsMappingApi.getBeamPositions();
      if (response.success && response.data) {
        setBeamPositions(response.data);
      } else {
        setBeamPositions([]);
      }
    } catch (error) {
      console.log('No beam positions found');
      setBeamPositions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (beamId: string) => {
    if (disabled) return;

    let newValue: string[];

    if (mode === 'multiple') {
      if (value.includes(beamId)) {
        newValue = value.filter(id => id !== beamId);
      } else {
        if (maxSelect && value.length >= maxSelect) {
          message.warning(`最多选择 ${maxSelect} 个梁位`);
          return;
        }
        newValue = [...value, beamId];
      }
    } else {
      newValue = value.includes(beamId) ? [] : [beamId];
    }

    onChange?.(newValue);
  };

  const handleClear = () => {
    onChange?.([]);
  };

  const handleSelectAll = () => {
    if (maxSelect) {
      message.warning(`最多选择 ${maxSelect} 个梁位`);
      return;
    }
    onChange?.(beamPositions.map(b => b.id));
  };

  // 地图绘制
  const drawMap = () => {
    if (!canvasRef.current || beamPositions.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // 清空画布
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制网格
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    const gridSize = 30 * scale;

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

    // 绘制补给站（原点）
    ctx.fillStyle = '#faad14';
    ctx.beginPath();
    ctx.arc(originScreenX, originScreenY, 8, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#faad14';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('补给站', originScreenX, originScreenY - 15);

    // 绘制梁位
    beamPositions.forEach(beam => {
      const screenX = originScreenX + beam.center.x * scale;
      const screenY = originScreenY - beam.center.y * scale;
      const isSelected = value.includes(beam.id);

      // 梁位区域
      const width = 20 * scale;
      const height = 40 * scale;

      ctx.fillStyle = isSelected ? 'rgba(82, 196, 26, 0.3)' : 'rgba(24, 144, 255, 0.2)';
      ctx.fillRect(screenX - width / 2, screenY - height / 2, width, height);

      ctx.strokeStyle = isSelected ? '#52c41a' : '#1890ff';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(screenX - width / 2, screenY - height / 2, width, height);

      // 梁位编号
      ctx.fillStyle = isSelected ? '#52c41a' : '#1890ff';
      ctx.font = `${isSelected ? 'bold ' : ''}12px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(beam.name, screenX, screenY + 4);

      // 选中标记
      if (isSelected) {
        ctx.fillStyle = '#52c41a';
        ctx.beginPath();
        ctx.arc(screenX + width / 2 - 5, screenY - height / 2 + 5, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 8px sans-serif';
        ctx.fillText('✓', screenX + width / 2 - 5, screenY - height / 2 + 8);
      }
    });
  };

  // 地图事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prev => Math.max(0.5, Math.min(3, prev * delta)));
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const originScreenX = canvas.width / 2 + offset.x;
    const originScreenY = canvas.height / 2 + offset.y;

    // 检查点击了哪个梁位
    for (const beam of beamPositions) {
      const screenX = originScreenX + beam.center.x * scale;
      const screenY = originScreenY - beam.center.y * scale;
      const width = 20 * scale;
      const height = 40 * scale;

      if (
        clickX >= screenX - width / 2 &&
        clickX <= screenX + width / 2 &&
        clickY >= screenY - height / 2 &&
        clickY <= screenY + height / 2
      ) {
        handleSelect(beam.id);
        return;
      }
    }
  };

  const handleZoomIn = () => setScale(prev => Math.min(prev * 1.2, 3));
  const handleZoomOut = () => setScale(prev => Math.max(prev / 1.2, 0.5));
  const handleResetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  if (loading) {
    return (
      <Card size="small">
        <Spin tip="加载梁位数据..." />
      </Card>
    );
  }

  return (
    <div>
      {/* 地图视图 */}
      {showMap && beamPositions.length > 0 && (
        <Card
          size="small"
          title={
            <Space>
              <EnvironmentOutlined />
              <span>梁场地图</span>
              <Badge count={selectedBeams.length} style={{ backgroundColor: '#52c41a' }} />
            </Space>
          }
          extra={
            <Space>
              <Tooltip title="放大">
                <Button icon={<ZoomInOutlined />} onClick={handleZoomIn} size="small" />
              </Tooltip>
              <Tooltip title="缩小">
                <Button icon={<ZoomOutOutlined />} onClick={handleZoomOut} size="small" />
              </Tooltip>
              <Tooltip title="重置视图">
                <Button icon={<FullscreenOutlined />} onClick={handleResetView} size="small" />
              </Tooltip>
            </Space>
          }
          style={{ marginBottom: 8 }}
        >
          <div
            style={{
              width: '100%',
              height: 300,
              border: '1px solid #d9d9d9',
              borderRadius: 4,
              overflow: 'hidden',
              cursor: isDragging ? 'grabbing' : 'grab',
              background: '#f5f5f5',
              position: 'relative'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onClick={handleCanvasClick}
          >
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', top: 0, left: 0 }}
            />
          </div>
          <div style={{ marginTop: 8, textAlign: 'center' }}>
            <Space>
              <span style={{ color: '#999', fontSize: 12 }}>
                💡 点击地图上的梁位进行选择
              </span>
            </Space>
          </div>
        </Card>
      )}

      {/* 梁位列表 */}
      <Card
        size="small"
        title={
          <Space>
            <EnvironmentOutlined />
            <span>梁位列表</span>
            {maxSelect && (
              <Tag color="orange">最多 {maxSelect} 个</Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="刷新梁位数据">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                onClick={loadBeamPositions}
                size="small"
              />
            </Tooltip>
            {mode === 'multiple' && beamPositions.length > 0 && (
              <Button size="small" onClick={handleSelectAll} disabled={disabled}>
                全选
              </Button>
            )}
            {selectedBeams.length > 0 && (
              <Button size="small" onClick={handleClear} disabled={disabled}>
                清空
              </Button>
            )}
          </Space>
        }
      >
        {beamPositions.length === 0 ? (
          <Empty
            description="暂无梁位数据，请先完成GPS建图"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          >
            <Button type="primary" href="/gps-mapping">
              前往GPS建图
            </Button>
          </Empty>
        ) : (
          <List
            size="small"
            dataSource={beamPositions}
            grid={{ column: 4, xs: 2, sm: 3, md: 4, lg: 4, xl: 4, xxl: 6 }}
            renderItem={beam => {
              const isSelected = value.includes(beam.id);

              return (
                <div
                  style={{
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: isSelected ? '#e6f7ff' : 'transparent',
                    border: isSelected ? '1px solid #1890ff' : '1px solid #d9d9d9',
                    borderRadius: 4,
                    padding: 8,
                    textAlign: 'center',
                    opacity: disabled ? 0.5 : 1,
                    margin: 2
                  }}
                  onClick={() => handleSelect(beam.id)}
                >
                  {isSelected ? (
                    <CheckOutlined style={{ color: '#1890ff', fontSize: 14 }} />
                  ) : (
                    <EnvironmentOutlined style={{ color: '#999', fontSize: 14 }} />
                  )}
                  <div style={{ fontSize: 12, marginTop: 4 }}>
                    {beam.name}
                  </div>
                </div>
              );
            }}
          />
        )}
      </Card>

      {/* 已选梁位统计 */}
      {selectedBeams.length > 0 && (
        <Card size="small" style={{ marginTop: 8 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Statistic
                title="已选梁位"
                value={selectedBeams.length}
                suffix={`/ ${beamPositions.length}`}
              />
            </Col>
            <Col span={12}>
              <div style={{ marginTop: 16 }}>
                <Space wrap>
                  {selectedBeams.map(beam => (
                    <Tag
                      key={beam.id}
                      closable={!disabled}
                      onClose={(e) => {
                        e.preventDefault();
                        handleSelect(beam.id);
                      }}
                      color="green"
                    >
                      {beam.name}
                    </Tag>
                  ))}
                </Space>
              </div>
            </Col>
          </Row>
        </Card>
      )}
    </div>
  );
};

export default BeamPositionSelector;