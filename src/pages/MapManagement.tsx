import React, { useState, useEffect } from 'react';
import { Card, Table, Button, Space, Modal, Form, Input, message, Popconfirm, Tag } from 'antd';
import { PlusOutlined, SaveOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons';
import { mapApi } from '../services/api';

const MapManagement: React.FC = () => {
  const [maps, setMaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveModalVisible, setSaveModalVisible] = useState(false);
  const [mappingStatus, setMappingStatus] = useState<'idle' | 'mapping'>('idle');
  const [form] = Form.useForm();

  useEffect(() => {
    loadMaps();
  }, []);

  const loadMaps = async () => {
    setLoading(true);
    try {
      const data = await mapApi.getMaps();
      setMaps(data);
    } catch (error: any) {
      message.error('加载地图列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleStartMapping = async () => {
    try {
      await mapApi.startMapping();
      setMappingStatus('mapping');
      message.success('开始建图');
    } catch (error: any) {
      message.error('启动建图失败');
    }
  };

  const handleStopMapping = async () => {
    try {
      await mapApi.stopMapping();
      setMappingStatus('idle');
      setSaveModalVisible(true);
    } catch (error: any) {
      message.error('停止建图失败');
    }
  };

  const handleSaveMap = async () => {
    try {
      const values = await form.validateFields();
      await mapApi.saveMap(values.name);
      message.success('地图保存成功');
      setSaveModalVisible(false);
      form.resetFields();
      loadMaps();
    } catch (error: any) {
      message.error('保存地图失败');
    }
  };

  const handleLoadMap = async (id: string) => {
    try {
      await mapApi.loadMap(id);
      message.success('地图加载成功');
      loadMaps();
    } catch (error: any) {
      message.error('加载地图失败');
    }
  };

  const handleDeleteMap = async (id: string) => {
    try {
      await mapApi.deleteMap(id);
      message.success('删除成功');
      loadMaps();
    } catch (error: any) {
      message.error('删除失败');
    }
  };

  const handleSetActive = async (id: string) => {
    try {
      await mapApi.setActiveMap(id);
      message.success('已设置为默认地图');
      loadMaps();
    } catch (error: any) {
      message.error('设置失败');
    }
  };

  const columns = [
    {
      title: '地图名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '状态',
      key: 'isActive',
      render: (_: any, record: any) => (
        record.isActive ? (
          <Tag color="green" icon={<CheckOutlined />}>默认地图</Tag>
        ) : (
          <Tag>未激活</Tag>
        )
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button 
            type="link" 
            size="small"
            onClick={() => handleLoadMap(record.id)}
          >
            加载
          </Button>
          {!record.isActive && (
            <Button 
              type="link" 
              size="small"
              onClick={() => handleSetActive(record.id)}
            >
              设为默认
            </Button>
          )}
          <Popconfirm
            title="确定删除此地图吗？"
            onConfirm={() => handleDeleteMap(record.id)}
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
      <Card 
        title="地图管理" 
        extra={
          <Space>
            {mappingStatus === 'idle' ? (
              <Button 
                type="primary" 
                icon={<PlusOutlined />}
                onClick={handleStartMapping}
              >
                开始建图
              </Button>
            ) : (
              <Button 
                danger
                icon={<SaveOutlined />}
                onClick={handleStopMapping}
              >
                停止并保存
              </Button>
            )}
          </Space>
        }
      >
        {mappingStatus === 'mapping' && (
          <div style={{ 
            padding: '20px', 
            background: '#fff7e6', 
            border: '1px solid #ffd591',
            borderRadius: '4px',
            marginBottom: '16px'
          }}>
            <p style={{ margin: 0, color: '#fa8c16' }}>
              <strong>正在建图中...</strong> 请控制机器人在场地内移动，覆盖所有需要建图的区域
            </p>
          </div>
        )}

        <Table
          columns={columns}
          dataSource={maps}
          rowKey="id"
          loading={loading}
          style={{ width: '100%' }}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Modal
        title="保存地图"
        open={saveModalVisible}
        onOk={handleSaveMap}
        onCancel={() => {
          setSaveModalVisible(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="地图名称"
            rules={[{ required: true, message: '请输入地图名称' }]}
          >
            <Input placeholder="例如: 一号梁场地图" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default MapManagement;
