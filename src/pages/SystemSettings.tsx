import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Switch, Button, message, Divider, Space } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { systemApi } from '../services/api';

const SystemSettings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await systemApi.getConfig();
      form.setFieldsValue(config);
    } catch (error: any) {
      message.error('加载配置失败');
      form.setFieldsValue({
        operationSpeed: 0.35,
        sprayDuration: 300,
        waterThreshold: 10,
        batteryThreshold: 20,
        autoSupplyEnabled: true,
        armHeightMin: 0.5,
        armHeightMax: 2.5,
        armHeightDefault: 1.8,
        maxLinearSpeed: 0.5,
        maxAngularSpeed: 1.0,
      });
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      await systemApi.updateConfig(values);
      message.success('配置保存成功');
    } catch (error: any) {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    loadConfig();
    message.info('已重置为默认配置');
  };

  return (
    <div>
      <Card title="系统配置">
        <Form form={form} layout="vertical">
          <Divider>作业参数</Divider>
          
          <Form.Item
            name="operationSpeed"
            label="默认作业速度 (米/秒)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.1} max={1.0} step={0.05} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="sprayDuration"
            label="默认喷淋时长 (秒)"
            rules={[{ required: true }]}
          >
            <InputNumber min={60} max={3600} step={30} style={{ width: '100%' }} />
          </Form.Item>

          <Divider>展臂参数</Divider>

          <Form.Item
            name="armHeightMin"
            label="支架最小高度 (米)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.3} max={2.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="armHeightMax"
            label="支架最大高度 (米)"
            rules={[{ required: true }]}
          >
            <InputNumber min={1.0} max={3.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="armHeightDefault"
            label="支架默认高度 (米)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.5} max={2.5} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Divider>运动控制参数</Divider>

          <Form.Item
            name="maxLinearSpeed"
            label="最大线速度 (米/秒)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.1} max={2.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="maxAngularSpeed"
            label="最大角速度 (弧度/秒)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.1} max={3.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Divider>补给参数</Divider>

          <Form.Item
            name="waterThreshold"
            label="低水位阈值 (%)"
            rules={[{ required: true }]}
          >
            <InputNumber min={5} max={50} step={5} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="batteryThreshold"
            label="低电量阈值 (%)"
            rules={[{ required: true }]}
          >
            <InputNumber min={10} max={50} step={5} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="autoSupplyEnabled"
            label="自动补给功能"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>

          <Divider />

          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={loading}
              >
                保存配置
              </Button>
              <Button onClick={handleReset}>
                重置为默认
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default SystemSettings;
