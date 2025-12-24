import React, { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Switch, Button, message, Divider, Space } from 'antd';
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
      const response = await fetch('http://localhost:3000/api/settings');
      const configs = await response.json();
      
      // 扁平化配置对象
      const flatConfig: any = {};
      Object.keys(configs).forEach(category => {
        configs[category].forEach((item: any) => {
          // 转换数值类型
          if (!isNaN(item.value) && item.value !== '') {
            flatConfig[item.key] = parseFloat(item.value);
          } else if (item.value === 'true' || item.value === 'false') {
            flatConfig[item.key] = item.value === 'true';
          } else {
            flatConfig[item.key] = item.value;
          }
        });
      });
      
      form.setFieldsValue(flatConfig);
    } catch (error: any) {
      message.error('加载配置失败');
      form.setFieldsValue({
        hostname: 'KWS-R2',
        bracket_min_height: 1.8,
        bracket_max_height: 2.8,
        bracket_default_height: 1.8,
        max_linear_speed: 0.35,
        max_angular_speed: 1.2,
        low_water_threshold: 10,
        low_battery_threshold: 10,
        navigation_max_speed: 0.5,
        navigation_obstacle_avoidance: true,
        navigation_planning_timeout: 30,
        mapping_resolution: 0.05,
        mapping_update_rate: 5,
        mapping_scan_range: 10.0,
        supply_marker_size: 0.168,
        supply_alignment_tolerance: 0.05,
        supply_max_retry_attempts: 3,
        camera_width: 640,
        camera_height: 480,
        camera_fps: 30,
        camera_enable_depth: true,
      });
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();
      
      // 转换为数组格式
      const configs = Object.keys(values).map(key => ({
        key,
        value: values[key].toString(),
        category: getCategoryByKey(key)
      }));
      
      await fetch('http://localhost:3000/api/settings/batch-update', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configs }),
      });
      
      message.success('配置保存成功');
    } catch (error: any) {
      message.error('保存失败');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryByKey = (key: string): string => {
    const categoryMap: { [key: string]: string } = {
      hostname: 'system',
      bracket_min_height: 'bracket',
      bracket_max_height: 'bracket',
      bracket_default_height: 'bracket',
      max_linear_speed: 'motion',
      max_angular_speed: 'motion',
      low_water_threshold: 'threshold',
      low_battery_threshold: 'threshold',
      navigation_max_speed: 'navigation',
      navigation_obstacle_avoidance: 'navigation',
      navigation_planning_timeout: 'navigation',
      mapping_resolution: 'mapping',
      mapping_update_rate: 'mapping',
      mapping_scan_range: 'mapping',
      supply_marker_size: 'supply',
      supply_alignment_tolerance: 'supply',
      supply_max_retry_attempts: 'supply',
      camera_width: 'camera',
      camera_height: 'camera',
      camera_fps: 'camera',
      camera_enable_depth: 'camera',
    };
    return categoryMap[key] || 'general';
  };

  const handleReset = () => {
    loadConfig();
    message.info('已重置为默认配置');
  };

  return (
    <div>
      <Card title="系统配置">
        <Form form={form} layout="vertical">
          <Divider>系统设置</Divider>
          
          <Form.Item
            name="hostname"
            label="系统主机名"
            rules={[{ required: true, message: '请输入主机名' }]}
          >
            <Input placeholder="KWS-R2" />
          </Form.Item>

          <Divider>支架参数</Divider>

          <Form.Item
            name="bracket_min_height"
            label="支架最小高度 (米)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.5} max={3.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="bracket_max_height"
            label="支架最大高度 (米)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.5} max={3.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="bracket_default_height"
            label="支架默认高度 (米)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.5} max={3.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Divider>运动控制参数</Divider>

          <Form.Item
            name="max_linear_speed"
            label="最大线速度 (米/秒)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.1} max={2.0} step={0.05} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="max_angular_speed"
            label="最大角速度 (弧度/秒)"
            rules={[{ required: true }]}
          >
            <InputNumber min={0.1} max={3.0} step={0.1} style={{ width: '100%' }} />
          </Form.Item>

          <Divider>阈值参数</Divider>

          <Form.Item
            name="low_water_threshold"
            label="低水位阈值 (%)"
            rules={[{ required: true }]}
          >
            <InputNumber min={5} max={50} step={1} style={{ width: '100%' }} />
          </Form.Item>

          <Form.Item
            name="low_battery_threshold"
            label="低电量阈值 (%)"
            rules={[{ required: true }]}
          >
            <InputNumber min={5} max={50} step={1} style={{ width: '100%' }} />
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
