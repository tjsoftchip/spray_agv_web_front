import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Card, Button, Space, Modal, Form, Input, Select, message, Tag, Progress, Popconfirm, Empty, TimePicker, Checkbox, Row, Col, Statistic } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseOutlined, StopOutlined, DeleteOutlined, EyeOutlined, DragOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { taskApi, templateApi, mapApi } from '../services/api';
import dayjs from 'dayjs';
import TemplateDragSelector from '../components/TemplateDragSelector';
import BeamPositionSelector from '../components/BeamPositionSelector';
import JobRoutePlanner from '../components/JobRoutePlanner';

const { TextArea } = Input;

// 格式化预估时间（秒转换为分秒格式）
const formatEstimatedTime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}分${secs}秒` : `${minutes}分钟`;
};

interface SortableTaskCardProps {
  id: string;
  task: any;
  onExecute: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onMonitor: () => void;
  onEditSchedule: (task: any) => void;
}

const SortableTaskCard: React.FC<SortableTaskCardProps> = ({ 
  id, 
  task, 
  onExecute, 
  onPause, 
  onResume, 
  onStop, 
  onDelete,
  onMonitor,
  onEditSchedule
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getStatusTag = (status: string) => {
    const statusMap: any = {
      pending: { color: 'default', text: '待执行' },
      running: { color: 'processing', text: '执行中' },
      paused: { color: 'warning', text: '已暂停' },
      completed: { color: 'success', text: '已完成' },
      failed: { color: 'error', text: '失败' },
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const getPriorityTag = (priority: number) => (
    <Tag color={priority === 1 ? 'red' : priority === 2 ? 'orange' : 'blue'}>
      {priority === 1 ? '高' : priority === 2 ? '中' : '低'}
    </Tag>
  );

  const getExecutionTypeTag = (type: string, isEnabled: boolean) => {
    if (type === 'scheduled') {
      return (
        <Tag color={isEnabled ? 'cyan' : 'default'} icon={<ClockCircleOutlined />}>
          {isEnabled ? '定时任务' : '定时（未启用）'}
        </Tag>
      );
    } else if (type === 'queue') {
      return <Tag color="purple">队列执行</Tag>;
    }
    return <Tag>手动执行</Tag>;
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card 
        size="small" 
        style={{ marginBottom: 12, cursor: 'move' }}
        styles={{ body: { padding: '16px' } }}
      >
        <Space orientation="vertical" style={{ width: '100%' }} size="small">
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Space>
              <DragOutlined {...listeners} style={{ cursor: 'grab', fontSize: 16, color: '#999' }} />
              <span style={{ fontWeight: 500, fontSize: 16 }}>{task.name}</span>
              {getStatusTag(task.status)}
              {getPriorityTag(task.priority)}
            </Space>
          </Space>
          
          {task.description && (
            <div style={{ color: '#666', fontSize: 14 }}>{task.description}</div>
          )}
          
          <Space style={{ width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <span style={{ fontSize: 12, color: '#999' }}>进度:</span>
              <Progress percent={task.progress || 0} size="small" style={{ width: 150 }} />
            </Space>
            <Space>
              {(task.status === 'running' || task.status === 'paused') && (
                <Button
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={onMonitor}
                >
                  监控
                </Button>
              )}
              {task.status === 'pending' && (
                <Button
                  type="link"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => onExecute(task.id)}
                >
                  执行
                </Button>
              )}
              {(task.status === 'completed' || task.status === 'failed') && (
                <Button
                  type="link"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => onExecute(task.id)}
                >
                  重新执行
                </Button>
              )}
              {task.status === 'running' && (
                <Button
                  type="link"
                  size="small"
                  icon={<PauseOutlined />}
                  onClick={() => onPause(task.id)}
                >
                  暂停
                </Button>
              )}
              {task.status === 'paused' && (
                <Button
                  type="link"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => onResume(task.id)}
                >
                  恢复
                </Button>
              )}
              {(task.status === 'running' || task.status === 'paused') && (
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<StopOutlined />}
                  onClick={() => onStop(task.id)}
                >
                  停止
                </Button>
              )}
              {(task.status === 'pending' || task.status === 'completed' || task.status === 'failed') && (
                <Popconfirm
                  title="确定删除此任务吗？"
                  onConfirm={() => onDelete(task.id)}
                  okText="确定"
                  cancelText="取消"
                >
                  <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                    删除
                  </Button>
                </Popconfirm>
              )}
            </Space>
          </Space>
        </Space>
      </Card>
    </div>
  );
};

const TaskManagement: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [queueStatus, setQueueStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [form] = Form.useForm();
  
  // 梁位选择和路线规划状态
  const [selectedBeamPositions, setSelectedBeamPositions] = useState<any[]>([]);
  const [jobRoute, setJobRoute] = useState<any>(null);

  // 使用 useRef 存储回调，避免每次渲染创建新函数
  const handlePositionsChange = useRef((positions: any[]) => {
    setSelectedBeamPositions(positions);
    setJobRoute(null);
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadTasks();
    loadTemplates();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await taskApi.getTasks();
      setTasks(data.sort((a: any, b: any) => (a.order || 0) - (b.order || 0)));
      updateQueueStatus(data);
    } catch (error: any) {
      message.error('加载任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const data = await templateApi.getTemplates();
      setTemplates(data);
    } catch (error: any) {
      console.error('加载模板列表失败', error);
    }
  };

  const updateQueueStatus = (taskList: any[]) => {
    const hasRunning = taskList.some((t: any) => t.status === 'running');
    const hasPaused = taskList.some((t: any) => t.status === 'paused');
    if (hasRunning) {
      setQueueStatus('running');
    } else if (hasPaused) {
      setQueueStatus('paused');
    } else {
      setQueueStatus('idle');
    }
  };

  const handleCreate = () => {
    form.resetFields();
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      // 构建任务数据，确保必填字段都有默认值
      const taskData = {
        name: values.name,
        description: values.description || '',
        priority: values.priority || 2,
        status: 'pending',
        templateIds: values.templateIds || [],
        executionType: values.operationType === 'scheduled' ? 'scheduled' : 'manual',
        operationType: values.operationType || 'single',
        scheduleConfig: values.scheduleConfig || null,
        isScheduleEnabled: values.operationType === 'scheduled',
        routeFilePath: jobRoute?.routeFilePath || null,  // 保存路线文件路径
        executionParams: {
          operationSpeed: 0.5,
          beamPositions: selectedBeamPositions.map(b => b.id),
          route: jobRoute || null,
        },
        transitionSequence: [],
        progress: 0,
        executionLogs: [],
        navigationSequence: jobRoute?.segments?.map((seg: any, index: number) => ({
          pointId: seg.roadId || `seg_${index}`,
          pointName: seg.name,
          position: { x: 0, y: 0, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
          status: 'pending'
        })) || [],
      };

      await taskApi.createTask(taskData);
      message.success('创建成功');
      setModalVisible(false);
      loadTasks();
    } catch (error: any) {
      console.error('创建任务失败:', error);
      message.error('创建失败: ' + (error.response?.data?.error || error.message || '未知错误'));
    }
  };

  const handleExecute = async (id: string) => {
    try {
      await taskApi.executeTask(id);
      message.success('任务已启动');
      loadTasks();
    } catch (error: any) {
      message.error('启动失败');
    }
  };

  const handlePause = async (id: string) => {
    try {
      await taskApi.pauseTask(id);
      message.success('任务已暂停');
      loadTasks();
    } catch (error: any) {
      message.error('暂停失败');
    }
  };

  const handleResume = async (id: string) => {
    try {
      await taskApi.resumeTask(id);
      message.success('任务已恢复');
      loadTasks();
    } catch (error: any) {
      message.error('恢复失败');
    }
  };

  const handleStop = async (id: string) => {
    try {
      await taskApi.stopTask(id);
      message.success('任务已停止');
      loadTasks();
    } catch (error: any) {
      message.error('停止失败');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await taskApi.deleteTask(id);
      message.success('删除成功');
      loadTasks();
    } catch (error: any) {
      message.error('删除失败');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex((t) => t.id === active.id);
      const newIndex = tasks.findIndex((t) => t.id === over.id);
      const newTasks = arrayMove(tasks, oldIndex, newIndex).map((t, index) => ({
        ...t,
        order: index + 1,
      }));

      setTasks(newTasks);

      try {
        await taskApi.updateTaskOrder(newTasks.map((t, index) => ({ id: t.id, order: index + 1 })));
        message.success('任务顺序已更新');
      } catch (error: any) {
        message.error('更新顺序失败');
        loadTasks();
      }
    }
  };

  const handleStartQueue = async () => {
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    if (pendingTasks.length === 0) {
      message.warning('没有待执行的任务');
      return;
    }
    
    try {
      await handleExecute(pendingTasks[0].id);
      message.success('队列已启动');
    } catch (error: any) {
      message.error('启动失败');
    }
  };

  const handlePauseQueue = async () => {
    const runningTask = tasks.find(t => t.status === 'running');
    if (runningTask) {
      await handlePause(runningTask.id);
    }
  };

  const handleResumeQueue = async () => {
    const pausedTask = tasks.find(t => t.status === 'paused');
    if (pausedTask) {
      await handleResume(pausedTask.id);
    }
  };

  const handleStopQueue = async () => {
    const activeTask = tasks.find(t => t.status === 'running' || t.status === 'paused');
    if (activeTask) {
      await handleStop(activeTask.id);
    }
  };

  const handleExecuteSequence = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/tasks/sequence/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        message.success(data.message);
        loadTasks();
      } else {
        message.error(data.error || '执行任务序列失败');
      }
    } catch (error) {
      console.error('Execute sequence error:', error);
      message.error('执行任务序列失败');
    } finally {
      setLoading(false);
    }
  };

  const getQueueStatusTag = (status: string) => {
    const statusMap: any = {
      idle: { color: 'default', text: '空闲' },
      running: { color: 'processing', text: '运行中' },
      paused: { color: 'warning', text: '已暂停' },
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  return (
    <div>
      <h2>任务管理</h2>
      
      <Card 
        title={
          <Space>
            <span>任务队列</span>
            {getQueueStatusTag(queueStatus)}
            <span style={{ fontSize: 14, color: '#999', fontWeight: 'normal' }}>
              (拖拽卡片可调整执行顺序)
            </span>
          </Space>
        }
        extra={
          <Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={handleCreate}
            >
              创建任务
            </Button>
            {queueStatus === 'idle' && tasks.filter(t => t.status === 'pending').length > 0 && (
              <Space>
                <Button 
                  icon={<PlayCircleOutlined />} 
                  onClick={handleStartQueue}
                  title="只执行第一个待执行任务"
                >
                  执行首个任务
                </Button>
                <Button 
                  type="primary" 
                  icon={<PlayCircleOutlined />} 
                  onClick={handleExecuteSequence}
                  title="按顺序执行所有待执行任务"
                >
                  执行全部序列
                </Button>
              </Space>
            )}
            {queueStatus === 'running' && (
              <Button icon={<PauseOutlined />} onClick={handlePauseQueue}>
                暂停队列
              </Button>
            )}
            {queueStatus === 'paused' && (
              <Button icon={<PlayCircleOutlined />} onClick={handleResumeQueue}>
                恢复队列
              </Button>
            )}
            {(queueStatus === 'running' || queueStatus === 'paused') && (
              <Button danger icon={<StopOutlined />} onClick={handleStopQueue}>
                停止队列
              </Button>
            )}
          </Space>
        }
        loading={loading}
      >
        {tasks.length === 0 ? (
          <Empty description="暂无任务，请创建新任务" />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <SortableTaskCard
                  key={task.id}
                  id={task.id}
                  task={task}
                  onExecute={handleExecute}
                  onPause={handlePause}
                  onResume={handleResume}
                  onStop={handleStop}
                  onDelete={handleDelete}
                  onMonitor={() => navigate('/status-monitor')}
                  onEditSchedule={() => {/* Reserved for future use */}}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </Card>

      <Modal
        title="创建作业任务"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={1400}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
        okText="确定创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Row gutter={24}>
            {/* 左侧：基本信息 */}
            <Col span={6}>
              <Form.Item
                name="name"
                label="任务名称"
                rules={[{ required: true, message: '请输入任务名称' }]}
              >
                <Input placeholder="例如：A区喷淋作业" />
              </Form.Item>

              <Form.Item name="description" label="描述">
                <TextArea rows={2} placeholder="任务描述（可选）" />
              </Form.Item>

              <Form.Item
                name="priority"
                label="优先级"
                rules={[{ required: true, message: '请选择优先级' }]}
                initialValue={2}
              >
                <Select>
                  <Select.Option value={1}>高</Select.Option>
                  <Select.Option value={2}>中</Select.Option>
                  <Select.Option value={3}>低</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="operationType"
                label="执行方式"
                rules={[{ required: true, message: '请选择执行方式' }]}
                initialValue="single"
              >
                <Select>
                  <Select.Option value="single">单次执行</Select.Option>
                  <Select.Option value="scheduled">定时执行</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => prevValues.operationType !== currentValues.operationType}
              >
                {({ getFieldValue }) => {
                  return getFieldValue('operationType') === 'scheduled' ? (
                    <Form.Item label="定时策略">
                      <Space direction="vertical" style={{ width: '100%' }} size="small">
                        <Form.Item
                          name={['scheduleConfig', 'type']}
                          label="执行周期"
                          initialValue="daily"
                          style={{ marginBottom: 8 }}
                        >
                          <Select style={{ width: '100%' }}>
                            <Select.Option value="once">单次定时</Select.Option>
                            <Select.Option value="daily">每天</Select.Option>
                            <Select.Option value="weekly">每周</Select.Option>
                          </Select>
                        </Form.Item>

                        <Form.Item
                          name={['scheduleConfig', 'time']}
                          label="执行时间"
                          initialValue={dayjs('09:00', 'HH:mm')}
                          style={{ marginBottom: 8 }}
                        >
                          <TimePicker format="HH:mm" style={{ width: '100%' }} />
                        </Form.Item>

                        <Form.Item
                          noStyle
                          shouldUpdate={(prevValues, currentValues) =>
                            prevValues.scheduleConfig?.type !== currentValues.scheduleConfig?.type
                          }
                        >
                          {({ getFieldValue }) => {
                            const scheduleType = getFieldValue(['scheduleConfig', 'type']);
                            return scheduleType === 'weekly' ? (
                              <Form.Item
                                name={['scheduleConfig', 'weekdays']}
                                label="选择星期"
                                initialValue={[1, 2, 3, 4, 5]}
                              >
                                <Checkbox.Group>
                                  <Checkbox value={1}>周一</Checkbox>
                                  <Checkbox value={2}>周二</Checkbox>
                                  <Checkbox value={3}>周三</Checkbox>
                                  <Checkbox value={4}>周四</Checkbox>
                                  <Checkbox value={5}>周五</Checkbox>
                                  <Checkbox value={6}>周六</Checkbox>
                                  <Checkbox value={0}>周日</Checkbox>
                                </Checkbox.Group>
                              </Form.Item>
                            ) : null;
                          }}
                        </Form.Item>
                      </Space>
                    </Form.Item>
                  ) : null;
                }}
              </Form.Item>

              {/* 路线概览卡片 */}
              {selectedBeamPositions.length > 0 && jobRoute && (
                <Card size="small" style={{ marginTop: 8, background: '#f6ffed', borderColor: '#b7eb8f' }}>
                  <Statistic
                    title="路线概览"
                    value={selectedBeamPositions.length}
                    suffix="个梁位"
                    valueStyle={{ fontSize: 18, color: '#52c41a' }}
                  />
                  <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                    <div>路线总长: {jobRoute.totalDistance?.toFixed(1) || jobRoute.totalLength?.toFixed(1) || 0}m</div>
                    <div>预计时间: {formatEstimatedTime(jobRoute.estimatedTime || 0)}</div>
                  </div>
                </Card>
              )}
            </Col>

            {/* 右侧：梁位选择和路线规划 */}
            <Col span={18}>
              <Form.Item
                label={<span style={{ fontSize: 14, fontWeight: 500 }}>选择作业梁位</span>}
                extra="选择需要喷淋作业的梁位，系统将自动生成最优路线"
                style={{ marginBottom: 8 }}
              >
                <BeamPositionSelector
                  mode="multiple"
                  maxSelect={20}
                  onPositionsChange={handlePositionsChange.current}
                />
              </Form.Item>

              {selectedBeamPositions.length > 0 && (
                <Form.Item label={<span style={{ fontSize: 14, fontWeight: 500 }}>作业路线规划</span>} style={{ marginBottom: 8 }}>
                  <JobRoutePlanner
                    beamPositions={selectedBeamPositions}
                    onChange={(route) => {
                      setJobRoute(route);
                    }}
                  />
                </Form.Item>
              )}
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default TaskManagement;
