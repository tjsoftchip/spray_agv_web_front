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
  Tooltip, Collapse, Badge
} from 'antd';
import {
  EnvironmentOutlined, ReloadOutlined, PlayCircleOutlined,
  CheckCircleOutlined, ArrowRightOutlined, EyeOutlined
} from '@ant-design/icons';
import { gpsMappingApi, jobPlanningApi } from '../services/gpsMappingApi';
import JobRouteDetailModal from './JobRouteDetailModal';

// 路线段类型（与后端一致）
interface RouteSegment {
  id: string;
  type: 'road' | 'turn_arc' | 'transit';
  road_id?: string;
  arc_id?: string;
  beam_id?: string;
  side?: string;
  spray_mode: 'none' | 'both' | 'left_only' | 'right_only';
  waypoints: Array<{ x: number; y: number; yaw: number; spray_action?: string }>;
}

// 后端返回的路线类型
interface BackendJobRoute {
  id: string;
  name: string;
  created: string;
  beam_sequence: string[];
  segments: RouteSegment[];
  statistics: {
    total_length: number;
    estimated_time: number;
    spray_length: number;
    transit_length: number;
  };
}

// 前端显示用的路线类型
interface JobRoute {
  id: string;
  name: string;
  totalLength: number;
  estimatedTime: number;
  segments: Array<{
    seq: number;
    name: string;
    roadId: string;
    length: number;
    sprayMode: 'none' | 'both' | 'left_only' | 'right_only';
    armStatus: 'retracted' | 'extended' | 'left_extended' | 'right_extended';
  }>;
  beamPositions: string[];
  routeFilePath?: string;  // 路线文件路径
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

// 将后端路线格式转换为前端显示格式
function convertBackendRouteToFrontend(backendRoute: BackendJobRoute): JobRoute {
  const segments = (backendRoute.segments || []).map((seg, index) => {
    // 计算路段长度
    let length = 0;
    const waypoints = seg.waypoints || [];
    for (let i = 0; i < waypoints.length - 1; i++) {
      const dx = waypoints[i + 1].x - waypoints[i].x;
      const dy = waypoints[i + 1].y - waypoints[i].y;
      length += Math.sqrt(dx * dx + dy * dy);
    }

    // 生成路段名称
    let name = seg.type === 'road' ? `道路 ${seg.road_id || index + 1}` :
               seg.type === 'turn_arc' ? `转弯 ${seg.arc_id || index + 1}` :
               `过渡段 ${index + 1}`;
    if (seg.beam_id && seg.side) {
      name = `${seg.beam_id} - ${seg.side}`;
    }

    // 确定机械臂状态
    let armStatus: 'retracted' | 'extended' | 'left_extended' | 'right_extended' = 'retracted';
    if (seg.spray_mode === 'both') armStatus = 'extended';
    else if (seg.spray_mode === 'left_only') armStatus = 'left_extended';
    else if (seg.spray_mode === 'right_only') armStatus = 'right_extended';

    return {
      seq: index + 1,
      name,
      roadId: seg.road_id || '',
      length: Math.round(length * 10) / 10,
      sprayMode: seg.spray_mode || 'none',
      armStatus
    };
  });

  return {
    id: backendRoute.id || `route_${Date.now()}`,
    name: backendRoute.name || '作业路线',
    totalLength: backendRoute.statistics?.total_length || 0,
    estimatedTime: backendRoute.statistics?.estimated_time || 0,
    segments,
    beamPositions: backendRoute.beam_sequence || []
  };
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
    if (beamPositions && beamPositions.length > 0) {
      autoPlanRoute();
    } else {
      setRoute(null);
      onChange?.(null as any);
    }
  }, [beamPositions ? beamPositions.map(b => b.id).join(',') : '']);

  // 自动规划路线
  const autoPlanRoute = async () => {
    if (!beamPositions || beamPositions.length === 0) {
      message.warning('请先选择梁位');
      return;
    }

    setLoading(true);
    try {
      const beamIds = beamPositions.map(b => b.id);
      // 使用梁位ID组合作为taskName，确保每个任务有唯一文件名
      const taskName = beamIds.join('_');
      const response = await jobPlanningApi.planRoutes(beamIds, taskName);

      if (response.success && response.data?.route) {
        // 转换后端数据格式为前端格式
        const frontendRoute = convertBackendRouteToFrontend(response.data.route);
        // 保存routeFilePath信息
        frontendRoute.routeFilePath = response.data.routeFilePath;
        setRoute(frontendRoute);
        onChange?.(frontendRoute);
        message.success('已生成最优作业路线');
      } else {
        message.error(response.message || '路线规划失败');
        setRoute(null);
      }
    } catch (error: any) {
      console.error('路线规划失败:', error);
      message.error('路线规划失败，请检查GPS建图数据');
      setRoute(null);
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
  const sprayStats = React.useMemo(() => {
    if (!route?.segments) return { both: 0, single: 0, sprayLength: 0 };
    return route.segments.reduce((acc, seg) => {
      if (seg.sprayMode === 'both') {
        acc.both++;
        acc.sprayLength += seg.length || 0;
      } else if (seg.sprayMode === 'left_only' || seg.sprayMode === 'right_only') {
        acc.single++;
        acc.sprayLength += seg.length || 0;
      }
      return acc;
    }, { both: 0, single: 0, sprayLength: 0 });
  }, [route?.segments]);

  return (
    <div>
      <Card
        size="small"
        title={
          <Space>
            <PlayCircleOutlined />
            <span>作业路线规划</span>
            {route && route.beamPositions && <Badge count={route.beamPositions.length} style={{ backgroundColor: '#52c41a' }} />}
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="重新规划路线">
              <Button
                icon={<ReloadOutlined />}
                onClick={autoPlanRoute}
                disabled={disabled || !beamPositions || beamPositions.length === 0}
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
          {!beamPositions || beamPositions.length === 0 ? (
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
              {/* 喷淋状态概览 */}
              <Row gutter={16} style={{ marginBottom: 12 }}>
                <Col span={6}>
                  <div style={{ textAlign: 'center', padding: 8, background: '#f6ffed', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, color: '#666' }}>总距离</div>
                    <div style={{ fontSize: 18, fontWeight: 'bold' }}>{route.totalLength.toFixed(1)}m</div>
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ textAlign: 'center', padding: 8, background: '#e6f7ff', borderRadius: 4 }}>
                    <div style={{ fontSize: 12, color: '#666' }}>预估时间</div>
                    <div style={{ fontSize: 18, fontWeight: 'bold' }}>{formatTime(route.estimatedTime)}</div>
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ textAlign: 'center', padding: 8, background: '#fff7e6', borderRadius: 4 }}>
                    <Tag color="green">双侧喷淋</Tag>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>{sprayStats.both} 段</div>
                  </div>
                </Col>
                <Col span={6}>
                  <div style={{ textAlign: 'center', padding: 8, background: '#f0f5ff', borderRadius: 4 }}>
                    <Tag color="blue">单侧喷淋</Tag>
                    <div style={{ fontSize: 16, fontWeight: 'bold' }}>{sprayStats.single} 段</div>
                  </div>
                </Col>
              </Row>

              {/* 路线段预览 - 默认展开，显示全部路段 */}
              <Collapse
                size="small"
                defaultActiveKey={['1']}
                items={[
                  {
                    key: '1',
                    label: `路线段详情 (${route.segments ? route.segments.length : 0}段)`,
                    children: route.segments && route.segments.length > 0 ? (
                      <List
                        size="small"
                        dataSource={route.segments}
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
                                  <span style={{ fontSize: 12, color: '#999' }}>{seg.length.toFixed(1)}m</span>
                                  <Tag color={config.color}>{config.label}</Tag>
                                </Space>
                              </Space>
                            </List.Item>
                          );
                        }}
                      />
                    ) : (
                      <Empty description="暂无路线段数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )
                  }
                ]}
              />

              {/* 闭环提示 */}
              <div style={{ marginTop: 12, textAlign: 'center', color: '#999', fontSize: 12 }}>
                <EnvironmentOutlined /> 补给站 → {route.beamPositions && route.beamPositions.slice(0, 5).join(' → ')}
                {route.beamPositions && route.beamPositions.length > 5 && ` ... +${route.beamPositions.length - 5}个`}
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