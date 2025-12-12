import React, { useEffect, useState } from 'react';
import { Card, Button, Space, Tag, Modal, Select, message, Empty } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseOutlined, StopOutlined, DeleteOutlined, DragOutlined } from '@ant-design/icons';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { taskQueueApi, taskApi } from '../services/api';

interface SortableItemProps {
  id: string;
  task: any;
  onRemove: (taskId: string) => void;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, task, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const getStatusTag = (status: string) => {
    const statusMap: any = {
      pending: { color: 'default', text: '待执行' },
      running: { color: 'processing', text: '执行中' },
      completed: { color: 'success', text: '已完成' },
      failed: { color: 'error', text: '失败' },
    };
    const config = statusMap[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card 
        size="small" 
        style={{ marginBottom: 8, cursor: 'move' }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space>
            <DragOutlined {...listeners} style={{ cursor: 'grab', fontSize: 16 }} />
            <span style={{ fontWeight: 500 }}>{task.name}</span>
            {getStatusTag(task.status)}
          </Space>
          <Button
            type="link"
            danger
            size="small"
            icon={<DeleteOutlined />}
            onClick={() => onRemove(task.taskId)}
          >
            移除
          </Button>
        </Space>
      </Card>
    </div>
  );
};

const TaskQueue: React.FC = () => {
  const [queue, setQueue] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    loadQueue();
    loadAllTasks();
  }, []);

  const loadQueue = async () => {
    try {
      const data = await taskQueueApi.getQueue();
      setQueue(data);
      setTasks(data.tasks || []);
    } catch (error: any) {
      message.error('加载队列失败');
    }
  };

  const loadAllTasks = async () => {
    try {
      const data = await taskApi.getTasks();
      setAllTasks(data);
    } catch (error: any) {
      console.error('加载任务列表失败', error);
    }
  };

  const handleAddTask = async () => {
    if (!selectedTaskId) {
      message.warning('请选择任务');
      return;
    }

    try {
      await taskQueueApi.addTask(selectedTaskId);
      message.success('添加成功');
      setModalVisible(false);
      setSelectedTaskId('');
      loadQueue();
    } catch (error: any) {
      message.error('添加失败');
    }
  };

  const handleRemoveTask = async (taskId: string) => {
    try {
      await taskQueueApi.removeTask(taskId);
      message.success('移除成功');
      loadQueue();
    } catch (error: any) {
      message.error('移除失败');
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tasks.findIndex((t) => t.taskId === active.id);
      const newIndex = tasks.findIndex((t) => t.taskId === over.id);
      const newTasks = arrayMove(tasks, oldIndex, newIndex).map((t, index) => ({
        ...t,
        order: index + 1,
      }));

      setTasks(newTasks);

      try {
        await taskQueueApi.reorder(newTasks);
        message.success('顺序已更新');
      } catch (error: any) {
        message.error('更新顺序失败');
        loadQueue();
      }
    }
  };

  const handleStart = async () => {
    try {
      await taskQueueApi.start();
      message.success('队列已启动');
      loadQueue();
    } catch (error: any) {
      message.error('启动失败');
    }
  };

  const handlePause = async () => {
    try {
      await taskQueueApi.pause();
      message.success('队列已暂停');
      loadQueue();
    } catch (error: any) {
      message.error('暂停失败');
    }
  };

  const handleResume = async () => {
    try {
      await taskQueueApi.resume();
      message.success('队列已恢复');
      loadQueue();
    } catch (error: any) {
      message.error('恢复失败');
    }
  };

  const handleStop = async () => {
    try {
      await taskQueueApi.stop();
      message.success('队列已停止');
      loadQueue();
    } catch (error: any) {
      message.error('停止失败');
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
      <h2>任务队列管理</h2>

      <Card 
        title={
          <Space>
            <span>队列状态</span>
            {queue && getQueueStatusTag(queue.status)}
          </Space>
        }
        extra={
          <Space>
            <Button 
              type="primary" 
              icon={<PlusOutlined />} 
              onClick={() => setModalVisible(true)}
            >
              添加任务
            </Button>
            {queue?.status === 'idle' && tasks.length > 0 && (
              <Button icon={<PlayCircleOutlined />} onClick={handleStart}>
                开始执行
              </Button>
            )}
            {queue?.status === 'running' && (
              <Button icon={<PauseOutlined />} onClick={handlePause}>
                暂停
              </Button>
            )}
            {queue?.status === 'paused' && (
              <Button icon={<PlayCircleOutlined />} onClick={handleResume}>
                恢复
              </Button>
            )}
            {(queue?.status === 'running' || queue?.status === 'paused') && (
              <Button danger icon={<StopOutlined />} onClick={handleStop}>
                停止
              </Button>
            )}
          </Space>
        }
      >
        {tasks.length === 0 ? (
          <Empty description="队列为空，请添加任务" />
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={tasks.map((t) => t.taskId)} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <SortableItem key={task.taskId} id={task.taskId} task={task} onRemove={handleRemoveTask} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </Card>

      <Modal
        title="添加任务到队列"
        open={modalVisible}
        onOk={handleAddTask}
        onCancel={() => setModalVisible(false)}
      >
        <Select
          style={{ width: '100%' }}
          placeholder="选择任务"
          value={selectedTaskId}
          onChange={setSelectedTaskId}
        >
          {allTasks
            .filter((t) => !tasks.some((qt) => qt.taskId === t.id))
            .map((t) => (
              <Select.Option key={t.id} value={t.id}>
                {t.name}
              </Select.Option>
            ))}
        </Select>
      </Modal>
    </div>
  );
};

export default TaskQueue;
