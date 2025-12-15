import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, InputNumber, Select, message, Popconfirm, Card, Tabs, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowLeftOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { templateApi } from '../services/api';
import NavigationPointManager from '../components/NavigationPointManager';
import RoadSegmentManager from '../components/RoadSegmentManager';
import PGMMapViewer from '../components/PGMMapViewer';

const { TextArea } = Input;

const TemplateManagement: React.FC = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [maps, setMaps] = useState<any[]>([]);
  const [form] = Form.useForm();

  useEffect(() => {
    loadTemplates();
    loadMaps();
  }, []);

  const loadMaps = async () => {
    try {
      const response = await fetch('/api/maps/scan-local');
      const data = await response.json();
      setMaps(data);
    } catch (error) {
      console.error('Failed to load maps:', error);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const data = await templateApi.getTemplates();
      setTemplates(data);
    } catch (error: any) {
      message.error('加载模板列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    setEditingTemplate(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleViewDetails = (record: any) => {
    setSelectedTemplate(record);
  };

  const handleBackToList = () => {
    setSelectedTemplate(null);
    loadTemplates();
  };

  const handleDelete = async (id: string) => {
    try {
      await templateApi.deleteTemplate(id);
      message.success('删除成功');
      loadTemplates();
    } catch (error: any) {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      const templateData = {
        ...values,
        navigationPoints: [],
        roadSegments: [],
      };

      if (editingTemplate) {
        await templateApi.updateTemplate(editingTemplate.id, templateData);
        message.success('更新成功');
      } else {
        await templateApi.createTemplate(templateData);
        message.success('创建成功');
      }
      
      setModalVisible(false);
      loadTemplates();
    } catch (error: any) {
      message.error('操作失败');
    }
  };

  const columns = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '梁场名称',
      dataIndex: 'yardName',
      key: 'yardName',
    },
    {
      title: '梁场形状',
      dataIndex: 'yardShape',
      key: 'yardShape',
      render: (shape: string) => shape === 'rectangle' ? '矩形' : '自定义',
    },
    {
      title: '尺寸(长x宽)',
      key: 'dimensions',
      render: (_: any, record: any) => 
        `${record.yardDimensions.length}m x ${record.yardDimensions.width}m`,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <span style={{ color: isActive ? '#52c41a' : '#999' }}>
          {isActive ? '启用' : '禁用'}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button 
            type="link" 
            onClick={() => handleViewDetails(record)}
          >
            详情
          </Button>
          <Button 
            type="link" 
            icon={<EditOutlined />} 
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此模板吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (selectedTemplate) {
    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={handleBackToList}
          >
            返回列表
          </Button>
        </div>

        <Card title={`模板详情: ${selectedTemplate.name}`}>
          <Tabs
            items={[
              {
                key: 'basic',
                label: '基本信息',
                children: (
                  <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Card size="small" title="模板信息">
                      <p><strong>模板名称：</strong>{selectedTemplate.name}</p>
                      <p><strong>描述：</strong>{selectedTemplate.description || '无'}</p>
                      <p><strong>梁场名称：</strong>{selectedTemplate.yardName}</p>
                      <p><strong>梁场形状：</strong>{selectedTemplate.yardShape === 'rectangle' ? '矩形' : '自定义'}</p>
                      <p><strong>梁场尺寸：</strong>{selectedTemplate.yardDimensions.length}m x {selectedTemplate.yardDimensions.width}m</p>
                      <p><strong>版本：</strong>{selectedTemplate.version}</p>
                      <p><strong>状态：</strong>{selectedTemplate.isActive ? '启用' : '禁用'}</p>
                    </Card>
                    <Card size="small" title="地图预览">
                      <PGMMapViewer
                        navigationPoints={selectedTemplate.navigationPoints || []}
                        roadSegments={selectedTemplate.roadSegments || []}
                        selectedMapId={selectedTemplate.defaultMapId}
                        showMapSelector={false}
                        height="400px"
                      />
                    </Card>
                  </Space>
                ),
              },
              {
                key: 'navigation',
                label: '导航点管理',
                children: (
                  <NavigationPointManager
                    templateId={selectedTemplate.id}
                    navigationPoints={selectedTemplate.navigationPoints || []}
                    onUpdate={loadTemplates}
                  />
                ),
              },
              {
                key: 'segments',
                label: '路段喷淋参数',
                children: (
                  <RoadSegmentManager
                    templateId={selectedTemplate.id}
                    roadSegments={selectedTemplate.roadSegments || []}
                    navigationPoints={selectedTemplate.navigationPoints || []}
                    onUpdate={loadTemplates}
                  />
                ),
              },
            ]}
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button 
          type="primary" 
          icon={<PlusOutlined />} 
          onClick={handleCreate}
        >
          创建模板
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={templates}
        rowKey="id"
        loading={loading}
        style={{ width: '100%' }}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={editingTemplate ? '编辑模板' : '创建模板'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="模板名称"
            rules={[{ required: true, message: '请输入模板名称' }]}
          >
            <Input placeholder="请输入模板名称" />
          </Form.Item>

          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="请输入描述" />
          </Form.Item>

          <Form.Item
            name="yardId"
            label="梁场ID"
            rules={[{ required: true, message: '请输入梁场ID' }]}
          >
            <Input placeholder="请输入梁场ID" />
          </Form.Item>

          <Form.Item
            name="yardName"
            label="梁场名称"
            rules={[{ required: true, message: '请输入梁场名称' }]}
          >
            <Input placeholder="请输入梁场名称" />
          </Form.Item>

          <Form.Item
            name="yardShape"
            label="梁场形状"
            rules={[{ required: true, message: '请选择梁场形状' }]}
          >
            <Select>
              <Select.Option value="rectangle">矩形</Select.Option>
              <Select.Option value="custom">自定义</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="梁场尺寸">
            <Space>
              <Form.Item
                name={['yardDimensions', 'length']}
                noStyle
                rules={[{ required: true, message: '请输入长度' }]}
              >
                <InputNumber placeholder="长度(米)" min={1} />
              </Form.Item>
              <span>x</span>
              <Form.Item
                name={['yardDimensions', 'width']}
                noStyle
                rules={[{ required: true, message: '请输入宽度' }]}
              >
                <InputNumber placeholder="宽度(米)" min={1} />
              </Form.Item>
            </Space>
          </Form.Item>

          <Form.Item name="defaultMapId" label="默认地图">
            <Select placeholder="选择默认地图" allowClear>
              {maps.map(map => (
                <Select.Option key={map.name} value={map.name}>
                  {map.name} ({map.width}x{map.height}, 分辨率: {map.resolution})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="version" label="版本" initialValue="1.0">
            <Input placeholder="版本号" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TemplateManagement;
