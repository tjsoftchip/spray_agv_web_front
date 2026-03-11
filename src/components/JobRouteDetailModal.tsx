import React, { useState } from 'react';
import { Modal, Table, Tag, Button, Space, Radio, message, Divider, Descriptions } from 'antd';
import { EditOutlined, ReloadOutlined } from '@ant-design/icons';

interface RouteSegment {
  seq: number;
  name: string;
  length: number; // 米
  sprayMode: 'none' | 'both' | 'left_only' | 'right_only';
  armStatus: 'retracted' | 'extended' | 'left_extended' | 'right_extended';
}

interface JobRouteDetailModalProps {
  visible: boolean;
  onClose: () => void;
  route: {
    id: string;
    name: string;
    totalLength: number;
    estimatedTime: number;
    segments: RouteSegment[];
    beamPositions: string[];
  } | null;
  onSegmentChange?: (seq: number, sprayMode: string) => void;
  onResetToAuto?: () => void;
}

const JobRouteDetailModal: React.FC<JobRouteDetailModalProps> = ({
  visible,
  onClose,
  route,
  onSegmentChange,
  onResetToAuto
}) => {
  const [editingSegment, setEditingSegment] = useState<number | null>(null);
  const [segments, setSegments] = useState<RouteSegment[]>([]);

  // 同步路由数据
  React.useEffect(() => {
    if (route?.segments) {
      setSegments(route.segments);
    }
  }, [route]);

  // 喷淋状态显示配置
  const sprayModeConfig: Record<string, { label: string; color: string }> = {
    'none': { label: '不喷淋', color: 'default' },
    'both': { label: '双侧喷淋', color: 'green' },
    'left_only': { label: '单侧(左)', color: 'blue' },
    'right_only': { label: '单侧(右)', color: 'orange' }
  };

  // 展臂状态显示配置
  const armStatusConfig: Record<string, { label: string; color: string }> = {
    'retracted': { label: '收起', color: 'default' },
    'extended': { label: '展开', color: 'green' },
    'left_extended': { label: '左展', color: 'blue' },
    'right_extended': { label: '右展', color: 'orange' }
  };

  // 处理喷淋状态修改
  const handleSprayModeChange = (seq: number, newMode: string) => {
    const newSegments = segments.map(seg => {
      if (seg.seq === seq) {
        // 根据喷淋模式自动设置展臂状态
        let armStatus = seg.armStatus;
        if (newMode === 'none') {
          armStatus = 'retracted';
        } else if (newMode === 'both') {
          armStatus = 'extended';
        } else if (newMode === 'left_only') {
          armStatus = 'left_extended';
        } else if (newMode === 'right_only') {
          armStatus = 'right_extended';
        }
        return { ...seg, sprayMode: newMode as any, armStatus };
      }
      return seg;
    });
    setSegments(newSegments);
    setEditingSegment(null);
    message.success('喷淋状态已修改');
    
    if (onSegmentChange) {
      onSegmentChange(seq, newMode);
    }
  };

  // 重置为自动判断
  const handleReset = () => {
    if (onResetToAuto) {
      onResetToAuto();
      message.success('已重置为自动判断');
    }
  };

  // 格式化时间
  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分钟`;
  };

  // 表格列定义
  const columns = [
    {
      title: '序号',
      dataIndex: 'seq',
      key: 'seq',
      width: 60,
    },
    {
      title: '路段名称',
      dataIndex: 'name',
      key: 'name',
      width: 150,
    },
    {
      title: '长度',
      dataIndex: 'length',
      key: 'length',
      width: 80,
      render: (length: number) => `${length}m`
    },
    {
      title: '喷淋状态',
      dataIndex: 'sprayMode',
      key: 'sprayMode',
      width: 150,
      render: (mode: string, record: RouteSegment) => {
        const config = sprayModeConfig[mode] || { label: mode, color: 'default' };
        if (editingSegment === record.seq) {
          return (
            <Radio.Group 
              size="small" 
              value={mode}
              onChange={(e) => handleSprayModeChange(record.seq, e.target.value)}
            >
              <Radio.Button value="none">不喷淋</Radio.Button>
              <Radio.Button value="both">双侧</Radio.Button>
              <Radio.Button value="left_only">左侧</Radio.Button>
              <Radio.Button value="right_only">右侧</Radio.Button>
            </Radio.Group>
          );
        }
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: '展臂状态',
      dataIndex: 'armStatus',
      key: 'armStatus',
      width: 100,
      render: (status: string) => {
        const config = armStatusConfig[status] || { label: status, color: 'default' };
        return <Tag color={config.color}>{config.label}</Tag>;
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: RouteSegment) => (
        <Button 
          type="link" 
          size="small" 
          icon={<EditOutlined />}
          onClick={() => setEditingSegment(editingSegment === record.seq ? null : record.seq)}
        >
          {editingSegment === record.seq ? '取消' : '修改'}
        </Button>
      )
    }
  ];

  if (!route) return null;

  return (
    <Modal
      title="作业线路详情"
      open={visible}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="reset" icon={<ReloadOutlined />} onClick={handleReset}>
          恢复自动判断
        </Button>,
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button key="confirm" type="primary" onClick={onClose}>
          确认修改
        </Button>
      ]}
    >
      <Descriptions column={4} size="small" style={{ marginBottom: 16 }}>
        <Descriptions.Item label="整体线路">
          补给站 → {route.beamPositions.join(' → ')} → 补给站
        </Descriptions.Item>
        <Descriptions.Item label="总长度">{route.totalLength}m</Descriptions.Item>
        <Descriptions.Item label="预计时间">{formatTime(route.estimatedTime)}</Descriptions.Item>
        <Descriptions.Item label="喷淋梁位">{route.beamPositions.length}个</Descriptions.Item>
      </Descriptions>

      <Divider>线路段详情（点击修改喷淋状态）</Divider>

      <Table
        dataSource={segments}
        columns={columns}
        rowKey="seq"
        pagination={false}
        size="small"
        scroll={{ y: 400 }}
      />

      <Divider>喷淋状态说明</Divider>
      <div style={{ fontSize: '12px', color: '#666' }}>
        <p>• <Tag color="green">双侧喷淋</Tag>: 中间道路两侧都有梁位被选中</p>
        <p>• <Tag color="blue">单侧(左)</Tag>: 仅左侧梁位被选中</p>
        <p>• <Tag color="orange">单侧(右)</Tag>: 仅右侧梁位被选中</p>
        <p>• <Tag color="default">不喷淋</Tag>: 过渡路段/起点终点路段</p>
      </div>
    </Modal>
  );
};

export default JobRouteDetailModal;
