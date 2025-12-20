import React, { useEffect, useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, InputNumber, Select, message, Popconfirm, Card, Tabs, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { templateApi } from '../services/api';
import NavigationPointManager from '../components/NavigationPointManager';
import RoadSegmentManager from '../components/RoadSegmentManager';
import PGMMapViewer from '../components/PGMMapViewer';
import InitialPoseSetter from '../components/InitialPoseSetter';

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

  const loadTemplates = async (reloadSelected: boolean = true) => {
    setLoading(true);
    try {
      const data = await templateApi.getTemplates();
      // 确保 data 是数组，如果不是则使用空数组
      const templatesData = Array.isArray(data) ? data : [];
      setTemplates(templatesData);
      
      // 只有在 reloadSelected 为 true 且有选中的模板时，才重新加载选中的模板
      if (reloadSelected && selectedTemplate) {
        try {
          const updatedTemplate = await templateApi.getTemplateById(selectedTemplate.id);
          // 强制创建新对象引用，确保 React 检测到变化
          setSelectedTemplate({
            ...updatedTemplate,
            navigationPoints: [...(updatedTemplate.navigationPoints || [])],
            roadSegments: [...(updatedTemplate.roadSegments || [])],
          });
        } catch (error) {
          console.error('Failed to reload selected template:', error);
          // 如果获取失败，尝试从列表中查找
          const fallbackTemplate = templatesData.find((t: any) => t.id === selectedTemplate.id);
          if (fallbackTemplate) {
            setSelectedTemplate({
              ...fallbackTemplate,
              navigationPoints: [...(fallbackTemplate.navigationPoints || [])],
              roadSegments: [...(fallbackTemplate.roadSegments || [])],
            });
          }
        }
      }
    } catch (error: any) {
      console.error('Load templates error:', error);
      message.error('加载模板列表失败');
      // 发生错误时确保设置为空数组
      setTemplates([]);
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
    // 加载模板列表，但不重新加载选中的模板
    loadTemplates(false);
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
      title: '默认地图',
      dataIndex: 'defaultMapId',
      key: 'defaultMapId',
      render: (mapId: string) => mapId || '未设置',
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
                  <Space vertical style={{ width: '100%' }} size="large">
                    <Card size="small" title="模板信息">
                      <p><strong>模板名称：</strong>{selectedTemplate.name}</p>
                      <p><strong>描述：</strong>{selectedTemplate.description || '无'}</p>
                      <p><strong>梁场名称：</strong>{selectedTemplate.yardName}</p>
                      <p><strong>默认地图：</strong>{selectedTemplate.defaultMapId || '未设置'}</p>
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
                key: 'initial-pose',
                label: '初始位置设置',
                children: (
                  <InitialPoseSetter
                    onPoseSet={(pose) => {
                      console.log('Initial pose set:', pose);
                      message.success('初始位置设置成功');
                    }}
                  />
                ),
              },
              {
                key: 'navigation',
                label: '导航点管理',
                children: (
                  <NavigationPointManager
                    key={`navpoints-${selectedTemplate.id}-${(selectedTemplate.navigationPoints || []).length}`}
                    templateId={selectedTemplate.id}
                    navigationPoints={selectedTemplate.navigationPoints || []}
                    onUpdate={loadTemplates}
                    mapId={selectedTemplate.defaultMapId}
                  />
                ),
              },
              {
                key: 'segments',
                label: '路段喷淋参数',
                children: (
                  <RoadSegmentManager
                    key={`segments-${selectedTemplate.id}-${(selectedTemplate.roadSegments || []).length}`}
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

          <Form.Item name="defaultMapId" label="默认地图">
            <Select placeholder="选择默认地图" allowClear>
              {maps.map(map => (
                <Select.Option key={map.name} value={map.name}>
                  {map.name} ({map.width}x{map.height}, 分辨率: {map.resolution})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default TemplateManagement;
