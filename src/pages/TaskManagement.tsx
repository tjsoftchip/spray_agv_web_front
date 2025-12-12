import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, InputNumber, message, Tag, Progress, Popconfirm } from 'antd';
import { PlusOutlined, PlayCircleOutlined, PauseOutlined, StopOutlined, DeleteOutlined } from '@ant-design/icons';
import { taskApi, templateApi } from '../services/api';

const { TextArea } = Input;

const TaskManagement: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    loadTasks();
    loadTemplates();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await taskApi.getTasks();
      setTasks(data);
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

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      render: (priority: number) => (
        <Tag color={priority === 1 ? 'red' : priority === 2 ? 'orange' : 'blue'}>
          {priority === 1 ? '高' : priority === 2 ? '中' : '低'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status),
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress: number) => <Progress percent={progress} size="small" />,
    },
    {
      title: '创建人',
      dataIndex: 'createdBy',
      key: 'createdBy',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          {record.status === 'pending' && (
            <Button
              type="link"
              icon={<PlayCircleOutlined />}
              onClick={() => handleExecute(record.id)}
            >
              执行
            </Button>
          )}
          {record.status === 'running' && (
            <Button
              type="link"
              icon={<PauseOutlined />}
              onClick={() => handlePause(record.id)}
            >
              暂停
            </Button>
          )}
          {record.status === 'paused' && (
            <Button
              type="link"
              icon={<PlayCircleOutlined />}
              onClick={() => handleResume(record.id)}
            >
              恢复
            </Button>
          )}
          {(record.status === 'running' || record.status === 'paused') && (
            <Button
              type="link"
              danger
              icon={<StopOutlined />}
              onClick={() => handleStop(record.id)}
            >
              停止
            </Button>
          )}
          {(record.status === 'pending' || record.status === 'completed' || record.status === 'failed') && (
            <Popconfirm
              title="确定删除此任务吗？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          创建任务
        </Button>
      </div>

      <Table columns={columns} dataSource={tasks} rowKey="id" loading={loading} />

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
          >
            <Select mode="multiple" placeholder="请选择操作模板">
              {templates.map((t) => (
                <Select.Option key={t.id} value={t.id}>
                  {t.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="transitionSequence" label="梁场过渡顺序">
            <Select mode="tags" placeholder="输入梁场ID并回车" />
          </Form.Item>

          <Form.Item label="操作频率">
            <Space>
              <Form.Item
                name={['operationFrequency', 'type']}
                noStyle
                initialValue="daily"
              >
                <Select style={{ width: 120 }}>
                  <Select.Option value="daily">每天</Select.Option>
                  <Select.Option value="weekly">每周</Select.Option>
                  <Select.Option value="custom">自定义</Select.Option>
                </Select>
              </Form.Item>
              <Form.Item name={['operationFrequency', 'interval']} noStyle initialValue={1}>
                <InputNumber min={1} placeholder="间隔" />
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item label="执行参数">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Form.Item
                name={['executionParams', 'operationSpeed']}
                label="作业速度(m/s)"
                initialValue={0.35}
              >
                <InputNumber min={0.1} max={1} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name={['executionParams', 'sprayDuration']}
                label="喷淋时长(秒)"
                initialValue={300}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                name={['executionParams', 'repeatCount']}
                label="重复次数"
                initialValue={1}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TaskManagement;
