import React, { useState, useEffect } from 'react';
import { Card, Select, Tag, Space, Button, List, Empty, Spin, message, Tooltip, Badge } from 'antd';
import { 
  EnvironmentOutlined, 
  ReloadOutlined, 
  CheckOutlined,
  InfoCircleOutlined 
} from '@ant-design/icons';
import { gpsMappingApi } from '../services/gpsMappingApi';

interface BeamPosition {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  mapX: number;
  mapY: number;
  length: number;
  width: number;
  faces: {
    north?: string;
    south?: string;
    east?: string;
    west?: string;
  };
}

interface BeamPositionSelectorProps {
  value?: string[];
  onChange?: (value: string[]) => void;
  onPositionsChange?: (positions: BeamPosition[]) => void; // 返回完整的梁位对象数组
  mode?: 'multiple' | 'single';
  maxSelect?: number;
  disabled?: boolean;
}

const BeamPositionSelector: React.FC<BeamPositionSelectorProps> = ({
  value = [],
  onChange,
  onPositionsChange,
  mode = 'multiple',
  maxSelect,
  disabled = false
}) => {
  const [beamPositions, setBeamPositions] = useState<BeamPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBeams, setSelectedBeams] = useState<BeamPosition[]>([]);

  // 加载梁位置数据
  useEffect(() => {
    loadBeamPositions();
  }, []);

  // 同步选中状态
  useEffect(() => {
    if (value.length > 0 && beamPositions.length > 0) {
      const selected = beamPositions.filter(b => value.includes(b.id));
      setSelectedBeams(selected);
    }
  }, [value, beamPositions]);

  // 当选中梁位变化时，通知父组件
  useEffect(() => {
    if (onPositionsChange) {
      onPositionsChange(selectedBeams);
    }
  }, [selectedBeams]);

  const loadBeamPositions = async () => {
    setLoading(true);
    try {
      const data = await gpsMappingApi.getSavedMaps();
      // 获取最新地图的梁位置
      if (data && data.length > 0) {
        const latestMap = data[data.length - 1];
        setBeamPositions(latestMap.beamPositions || []);
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
      newValue = [beamId];
    }
    
    onChange?.(newValue);
  };

  const handleClear = () => {
    onChange?.([]);
  };

  const getFaceTags = (faces: BeamPosition['faces']) => {
    const faceNames: { [key: string]: string } = {
      north: '北面',
      south: '南面',
      east: '东面',
      west: '西面'
    };
    
    return Object.entries(faces)
      .filter(([_, routeId]) => routeId)
      .map(([face, routeId]) => (
        <Tag key={face} color="blue" style={{ fontSize: 10 }}>
          {faceNames[face]}
        </Tag>
      ));
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
      <Card 
        size="small"
        title={
          <Space>
            <EnvironmentOutlined />
            <span>梁位选择</span>
            {maxSelect && (
              <Tag color="orange">
                最多选择 {maxSelect} 个
              </Tag>
            )}
          </Space>
        }
        extra={
          <Space>
            <Badge count={selectedBeams.length} />
            <Tooltip title="刷新梁位数据">
              <Button 
                type="text" 
                icon={<ReloadOutlined />} 
                onClick={loadBeamPositions}
                size="small"
              />
            </Tooltip>
            {selectedBeams.length > 0 && (
              <Button size="small" onClick={handleClear}>
                清除选择
              </Button>
            )}
          </Space>
        }
      >
        {beamPositions.length === 0 ? (
          <Empty 
            description="暂无梁位数据，请先在GPS建图页面标记梁位置" 
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
            renderItem={beam => {
              const isSelected = value.includes(beam.id);
              
              return (
                <List.Item
                  style={{
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    background: isSelected ? '#e6f7ff' : 'transparent',
                    border: isSelected ? '1px solid #1890ff' : '1px solid transparent',
                    borderRadius: 4,
                    padding: '8px 12px',
                    marginBottom: 4,
                    opacity: disabled ? 0.5 : 1
                  }}
                  onClick={() => handleSelect(beam.id)}
                >
                  <List.Item.Meta
                    avatar={
                      isSelected ? (
                        <CheckOutlined style={{ color: '#1890ff', fontSize: 18 }} />
                      ) : (
                        <EnvironmentOutlined style={{ color: '#999', fontSize: 18 }} />
                      )
                    }
                    title={
                      <Space>
                        <span>{beam.name}</span>
                        {isSelected && <Tag color="green">已选</Tag>}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={0}>
                        <span style={{ fontSize: 12, color: '#666' }}>
                          尺寸: {beam.length}m × {beam.width}m
                        </span>
                        <Space size={4}>
                          {getFaceTags(beam.faces)}
                        </Space>
                      </Space>
                    }
                  />
                </List.Item>
              );
            }}
            style={{ maxHeight: 300, overflow: 'auto' }}
          />
        )}
      </Card>
      
      {/* 已选中的梁位预览 */}
      {selectedBeams.length > 0 && (
        <Card size="small" style={{ marginTop: 8 }} title="已选梁位">
          <Space wrap>
            {selectedBeams.map(beam => (
              <Tag 
                key={beam.id} 
                closable={!disabled}
                onClose={() => handleSelect(beam.id)}
                color="blue"
              >
                {beam.name}
              </Tag>
            ))}
          </Space>
        </Card>
      )}
    </div>
  );
};

export default BeamPositionSelector;
