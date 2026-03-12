/**
 * 作业路线规划器
 * 按照文档 web-gps-mapping-design.md 设计实现
 * 
 * 功能：
 * - 接收用户选择的梁位
 * - 调用后端API生成最优路线
 * - 显示路线详情和喷淋状态
 * - 支持查看和编辑路线段
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Row, Col, Button, Space, Tag, List, Empty, Spin, message,
  Tooltip, Collapse, Divider, Statistic, Badge
} from 'antd';
import {
  EnvironmentOutlined, ReloadOutlined, PlayCircleOutlined,
  CheckCircleOutlined, ArrowRightOutlined, EyeOutlined,
  WarningOutlined, SettingOutlined
} from '@ant-design/icons';
import { gpsMappingApi, jobPlanningApi } from '../services/gpsMappingApi';
import JobRouteDetailModal from './JobRouteDetailModal';

// 路线段类型（与后端一致）
interface RouteSegment {
  seq: number;
  name: string;
  roadId: string;
  length: number;
  sprayMode: 'none' | 'both' | 'left_only' | 'right_only';
  armStatus: 'retracted' | 'extended' | 'left_extended' | 'right_extended';
  sprayConfig?: {
    arm: string;
    leftValve: boolean;
    rightValve: boolean;
    pump: boolean;
    mountRaised: boolean;
  };
}

// 路线类型
interface JobRoute {
  id: string;
  name: string;
  totalLength: number;
  estimatedTime: number;
  segments: RouteSegment[];
  beamPositions: string[];
}

interface BeamPosition {
  id: string;
  name: string;
  row: string;
  col: number;
  center: { x: number; y: number };
}

interface JobRoutePlannerProps {
  beamPositions: BeamPosition[];
  value?: JobRoute;
  onChange?: (route: JobRoute) => void;
  disabled?: boolean;
}

const JobRoutePlanner: React.FC<JobRoutePlannerProps> = ({
  beamPositions,
  value,
  onChange,
  disabled = false
}) => {
  const [route, setRoute] = useState<JobRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // 同步外部值
  useEffect(() => {
    if (value) {
      setRoute(value);
    }
  }, [value]);

  // 当梁位变化时，自动规划路线
  useEffect(() => {
    if (beamPositions.length > 0) {
      autoPlanRoute();
    } else {
      setRoute(null);
      onChange?.(null as any);
    }
  }, [beamPositions.map(b => b.id).join(',')]);

  // 自动规划路线
  const autoPlanRoute = async () => {
    if (beamPositions.length === 0) {
      message.warning('请先选择梁位');
      return;
    }

    setLoading(true);
    try {
      const beamIds = beamPositions.map(b => b.id);
      const response = await jobPlanningApi.planRoutes(beamIds);

      if (response.success && response.data?.route) {
        setRoute(response.data.route);
        onChange?.(response.data.route);
        message.success('已生成最优作业路线');
      } else {
        message.error(response.message || '路线规划失败');
      }
    } catch (error: any) {
      console.error('路线规划失败:', error);
      message.error('路线规划失败，请检查GPS建图数据');
    } finally {
      setLoading(false);
    }
  };

  // 格式化时间
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分钟`;
  };

  // 喷淋状态显示配置
  const sprayModeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    'none': { label: '不喷淋', color: 'default', icon: <span>○</span> },
    'both': { label: '双侧喷淋', color: 'green', icon: <CheckCircleOutlined /> },
    'left_only': { label: '左侧喷淋', color: 'blue', icon: <ArrowRightOutlined /> },
    'right_only': { label: '右侧喷淋', color: 'orange', icon: <ArrowRightOutlined /> }
  };

  // 统计喷淋路段
  const sprayStats = route?.segments.reduce((acc, seg) => {
    if (seg.sprayMode === 'both') {
      acc.both++;
      acc.sprayLength += seg.length;
    } else if (seg.sprayMode === 'left_only' || seg.sprayMode === 'right_only') {
      acc.single++;
      acc.sprayLength += seg.length;
    }
    return acc;
  }, { both: 0, single: 0, sprayLength: 0 }) || { both: 0, single: 0, sprayLength: 0 };

  return (
    <div>
      <Card
        size="small"
        title={
          <Space>
            <PlayCircleOutlined />
            <span>作业路线规划</span>
            {route && <Badge count={route.beamPositions.length} style={{ backgroundColor: '#52c41a' }} />}
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="重新规划路线">
              <Button
                icon={<ReloadOutlined />}
                onClick={autoPlanRoute}
                disabled={disabled || beamPositions.length === 0}
                loading={loading}
                size="small"
              >
                重新规划
              </Button>
            </Tooltip>
            {route && (
              <Button
                icon={<EyeOutlined />}
                onClick={() => setDetailModalVisible(true)}
                size="small"
              >
                查看详情
              </Button>
            )}
          </Space>
        }
      >
        <Spin spinning={loading}>
          {beamPositions.length === 0 ? (
            <Empty
              description="请先选择梁位"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : !route ? (
            <Empty
              description="点击'重新规划'生成路线"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : (
            <>
              {/* 路线概览 */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Statistic
                    title="总距离"
                    value={route.totalLength.toFixed(1)}
                    suffix="米"
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="预估时间"
                    value={formatTime(route.estimatedTime)}
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="喷淋梁位"
                    value={route.beamPositions.length}
                    suffix="个"
                    valueStyle={{ fontSize: 18, color: '#52c41a' }}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="路段数"
                    value={route.segments.length}
                    suffix="段"
                    valueStyle={{ fontSize: 18 }}
                  />
                </Col>
              </Row>

              <Divider style={{ margin: '12px 0' }} />

              {/* 喷淋状态概览 */}
              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <div style={{ textAlign: 'center', padding: 8, background: '#f6ffed', borderRadius: 4 }}>
                    <Tag color="green">双侧喷淋</Tag>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>{sprayStats.both} 段</div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ textAlign: 'center', padding: 8, background: '#e6f7ff', borderRadius: 4 }}>
                    <Tag color="blue">单侧喷淋</Tag>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>{sprayStats.single} 段</div>
                  </div>
                </Col>
                <Col span={8}>
                  <div style={{ textAlign: 'center', padding: 8, background: '#fff7e6', borderRadius: 4 }}>
                    <Tag color="orange">喷淋距离</Tag>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>{sprayStats.sprayLength.toFixed(0)}m</div>
                  </div>
                </Col>
              </Row>

              {/* 路线段预览 */}
              <Collapse
                size="small"
                items={[
                  {
                    key: '1',
                    label: `路线段详情 (${route.segments.length}段)`,
                    children: (
                      <List
                        size="small"
                        dataSource={route.segments.slice(0, 10)}
                        renderItem={seg => {
                          const config = sprayModeConfig[seg.sprayMode] || sprayModeConfig['none'];
                          return (
                            <List.Item style={{ padding: '8px 0' }}>
                              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Space>
                                  <Tag>{seg.seq}</Tag>
                                  <span>{seg.name}</span>
                                </Space>
                                <Space>
                                  <span style={{ fontSize: 12, color: '#999' }}>{seg.length}m</span>
                                  <Tag color={config.color}>{config.label}</Tag>
                                </Space>
                              </Space>
                            </List.Item>
                          );
                        }}
                      />
                    )
                  }
                ]}
              />

              {/* 闭环提示 */}
              <div style={{ marginTop: 12, textAlign: 'center', color: '#999', fontSize: 12 }}>
                <EnvironmentOutlined /> 补给站 → {route.beamPositions.slice(0, 5).join(' → ')}
                {route.beamPositions.length > 5 && ` ... +${route.beamPositions.length - 5}个`}
                {' '}→ 补给站
              </div>
            </>
          )}
        </Spin>
      </Card>

      {/* 路线详情弹窗 */}
      <JobRouteDetailModal
        visible={detailModalVisible}
        onClose={() => setDetailModalVisible(false)}
        route={route}
        onSegmentChange={(seq, sprayMode) => {
          // 更新路线段
          if (route) {
            const newSegments = route.segments.map(seg =>
              seg.seq === seq ? { ...seg, sprayMode: sprayMode as any } : seg
            );
            const newRoute = { ...route, segments: newSegments };
            setRoute(newRoute);
            onChange?.(newRoute);
          }
        }}
        onResetToAuto={() => {
          autoPlanRoute();
        }}
      />
    </div>
  );
};

export default JobRoutePlanner;