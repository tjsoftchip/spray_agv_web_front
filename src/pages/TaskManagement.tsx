import React, { useEffect, useState } from 'react';
import { Card, Button, Space, Modal, Form, Input, Select, InputNumber, message, Tag, Progress, Popconfirm, Empty, Switch, DatePicker, TimePicker, Checkbox } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseOutlined, StopOutlined, DeleteOutlined, EyeOutlined, DragOutlined, ClockCircleOutlined, EditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { taskApi, templateApi } from '../services/api';
import dayjs from 'dayjs';
import TemplateDragSelector from '../components/TemplateDragSelector';

const { TextArea } = Input;

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
      await taskApi.createTask(values);
      message.success('创建成功');
      setModalVisible(false);
      loadTasks();
    } catch (error: any) {
      message.error('创建失败');
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

  const handleGetCurrentPosition = async () => {
    try {
      const data = await apiService.get('/templates/robot/current-position');
      
      form.setFieldsValue({
        ['initialPosition']: {
          x: data.position.x,
          y: data.position.y,
          theta: data.orientation.theta || 0
        }
      });
      
      message.success('已获取当前机器人位置');
    } catch (error) {
      message.error('获取当前位置失败');
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
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </Card>

      <Modal
        title="创建任务"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="请输入描述" />
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
            name="templateIds"
            label="操作模板"
            rules={[{ required: true, message: '请选择操作模板' }]}
            extra="拖拽可调整执行顺序"
          >
            <TemplateDragSelector templates={templates} />
          </Form.Item>

          

          <Form.Item
            name="operationType"
            label="操作频率"
            rules={[{ required: true, message: '请选择操作频率' }]}
            initialValue="single"
          >
            <Select style={{ width: 200 }}>
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
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Form.Item
                      name={['scheduleConfig', 'type']}
                      label="执行周期"
                      initialValue="daily"
                    >
                      <Select style={{ width: 200 }}>
                        <Select.Option value="once">单次定时</Select.Option>
                        <Select.Option value="daily">每天</Select.Option>
                        <Select.Option value="weekly">每周</Select.Option>
                      </Select>
                    </Form.Item>
                    
                    <Form.Item
                      name={['scheduleConfig', 'time']}
                      label="执行时间"
                      initialValue={dayjs('09:00', 'HH:mm')}
                    >
                      <TimePicker format="HH:mm" style={{ width: 200 }} />
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

          <Form.Item label="初始位置设置">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Form.Item
                name={['initialPosition', 'x']}
                label="X坐标 (米)"
                initialValue={0}
              >
                <InputNumber step={0.1} precision={3} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name={['initialPosition', 'y']}
                label="Y坐标 (米)"
                initialValue={0}
              >
                <InputNumber step={0.1} precision={3} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name={['initialPosition', 'theta']}
                label="方向角 (弧度)"
                initialValue={0}
              >
                <InputNumber step={0.1} precision={3} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item>
                <Space>
                  <Button 
                    type="dashed"
                    onClick={handleGetCurrentPosition}
                  >
                    使用当前位置
                  </Button>
                  <Button 
                    type="dashed"
                    onClick={() => form.setFieldsValue({
                      initialPosition: {
                        x: 0,
                        y: 0,
                        theta: 0
                      }
                    })}
                  >
                    重置为原点
                  </Button>
                  <Button 
                    type="dashed"
                    onClick={() => form.setFieldsValue({
                      initialPosition: {
                        ...form.getFieldValue('initialPosition'),
                        theta: 0
                      }
                    })}
                  >
                    朝向 0°
                  </Button>
                  <Button 
                    type="dashed"
                    onClick={() => form.setFieldsValue({
                      initialPosition: {
                        ...form.getFieldValue('initialPosition'),
                        theta: Math.PI / 2
                      }
                    })}
                  >
                    朝向 90°
                  </Button>
                </Space>
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item label="执行参数">
            <Form.Item
              name={['executionParams', 'operationSpeed']}
              label="作业速度(m/s)"
              initialValue={0.35}
            >
              <InputNumber min={0.1} max={1} step={0.05} style={{ width: '100%' }} />
            </Form.Item>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TaskManagement;
