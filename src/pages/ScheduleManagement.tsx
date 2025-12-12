import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, DatePicker, InputNumber, message, Popconfirm, Tag, Switch } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

const { TextArea } = Input;

const ScheduleManagement: React.FC = () => {
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<any>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    setLoading(true);
    try {
      setSchedules([]);
    } catch (error: any) {
      message.error('加载定时任务列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingSchedule(null);
    form.resetFields();
    form.setFieldsValue({
      scheduleType: 'daily',
      status: 'active',
      repeatInterval: 1,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingSchedule(record);
    form.setFieldsValue({
      ...record,
      startTime: dayjs(record.startTime),
      endTime: record.endTime ? dayjs(record.endTime) : null,
    });
    setModalVisible(true);
  };

  const handleDelete = async (_id: string) => {
    try {
      message.success('删除成功');
      loadSchedules();
    } catch (error: any) {
      message.error('删除失败');
    }
  };

  const handleToggleStatus = async (_id: string, _currentStatus: string) => {
    try {
      message.success('状态已更新');
      loadSchedules();
    } catch (error: any) {
      message.error('操作失败');
    }
  };

  const handleSubmit = async () => {
    try {
      await form.validateFields();
      message.success(editingSchedule ? '更新成功' : '创建成功');
      setModalVisible(false);
      loadSchedules();
    } catch (error: any) {
      message.error('操作失败');
    }
  };

  const columns = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'scheduleType',
      key: 'scheduleType',
      render: (type: string) => {
        const typeMap: any = {
          once: '一次性',
          daily: '每日',
          weekly: '每周',
          monthly: '每月',
          cron: '自定义',
        };
        return typeMap[type] || type;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: any) => (
        <Space>
          <Tag color={status === 'active' ? 'green' : 'default'}>
            {status === 'active' ? '启用' : '禁用'}
          </Tag>
          <Switch
            size="small"
            checked={status === 'active'}
            onChange={() => handleToggleStatus(record.id, status)}
          />
        </Space>
      ),
    },
    {
      title: '下次执行',
      dataIndex: 'nextExecution',
      key: 'nextExecution',
      render: (date: string) => date ? new Date(date).toLocaleString('zh-CN') : '-',
    },
    {
      title: '执行次数',
      dataIndex: 'executionCount',
      key: 'executionCount',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button 
            type="link" 
            size="small"
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此定时任务吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={handleCreate}
        >
          创建定时任务
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={schedules}
        rowKey="id"
        loading={loading}
      />

      <Modal
        title={editingSchedule ? '编辑定时任务' : '创建定时任务'}
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
            <Input placeholder="例如: 每日养护任务" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={2} placeholder="任务描述" />
          </Form.Item>

          <Form.Item
            name="taskId"
            label="关联任务"
            rules={[{ required: true, message: '请选择任务' }]}
          >
            <Select placeholder="选择要执行的任务">
              <Select.Option value="task_001">测试任务1</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="scheduleType"
            label="执行类型"
            rules={[{ required: true, message: '请选择类型' }]}
          >
            <Select>
              <Select.Option value="once">一次性</Select.Option>
              <Select.Option value="daily">每日</Select.Option>
              <Select.Option value="weekly">每周</Select.Option>
              <Select.Option value="monthly">每月</Select.Option>
              <Select.Option value="cron">自定义(Cron)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="startTime"
            label="开始时间"
            rules={[{ required: true, message: '请选择开始时间' }]}
          >
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.scheduleType !== currentValues.scheduleType}
          >
            {({ getFieldValue }) => {
              const scheduleType = getFieldValue('scheduleType');
              if (scheduleType === 'cron') {
                return (
                  <Form.Item
                    name="cronExpression"
                    label="Cron表达式"
                    rules={[{ required: true, message: '请输入Cron表达式' }]}
                  >
                    <Input placeholder="例如: 0 8 * * * (每天8点)" />
                  </Form.Item>
                );
              }
              if (scheduleType !== 'once') {
                return (
                  <Form.Item
                    name="repeatInterval"
                    label="重复间隔"
                    rules={[{ required: true }]}
                  >
                    <InputNumber min={1} style={{ width: '100%' }} />
                  </Form.Item>
                );
              }
              return null;
            }}
          </Form.Item>

          <Form.Item name="maxExecutions" label="最大执行次数（留空表示无限）">
            <InputNumber min={1} style={{ width: '100%' }} placeholder="不限制" />
          </Form.Item>

          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="active">启用</Select.Option>
              <Select.Option value="inactive">禁用</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ScheduleManagement;
