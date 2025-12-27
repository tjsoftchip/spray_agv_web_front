import React, { useState } from 'react';
import { Card, Switch, Button, Space, Divider } from 'antd';

const SwitchTestPage: React.FC = () => {
  const [switch1, setSwitch1] = useState(false);
  const [switch2, setSwitch2] = useState(true);
  const [switch3, setSwitch3] = useState(false);

  return (
    <div style={{ padding: '20px' }}>
      <Card title="Switch组件样式测试" style={{ maxWidth: '800px', margin: '0 auto' }}>
        <Space vertical size="large" style={{ width: '100%' }}>
          
          <div>
            <h3>基本开关测试</h3>
            <Space>
              <Switch 
                checked={switch1} 
                onChange={setSwitch1}
                checkedChildren="开启" 
                unCheckedChildren="关闭" 
              />
              <span>状态: {switch1 ? '开启' : '关闭'}</span>
            </Space>
          </div>

          <Divider />

          <div>
            <h3>设备控制开关</h3>
            <Space vertical>
              <Space>
                <Switch 
                  checked={switch2} 
                  onChange={setSwitch2}
                  checkedChildren="水泵运行" 
                  unCheckedChildren="水泵停止" 
                />
                <span>水泵状态: {switch2 ? '运行中' : '已停止'}</span>
              </Space>
              <Space>
                <Switch 
                  checked={switch3} 
                  onChange={setSwitch3}
                  checkedChildren="左阀开启" 
                  unCheckedChildren="左阀关闭" 
                />
                <span>左阀状态: {switch3 ? '开启' : '关闭'}</span>
              </Space>
            </Space>
          </div>

          <Divider />

          <div>
            <h3>不同状态的开关</h3>
            <Space vertical>
              <Space>
                <Switch defaultChecked checkedChildren="正常开启" unCheckedChildren="正常关闭" />
                <span>正常状态</span>
              </Space>
              <Space>
                <Switch disabled checkedChildren="禁用开启" unCheckedChildren="禁用关闭" />
                <span>禁用状态</span>
              </Space>
              <Space>
                <Switch loading checkedChildren="加载中" unCheckedChildren="加载中" />
                <span>加载状态</span>
              </Space>
            </Space>
          </div>

          <Divider />

          <div>
            <h3>样式验证说明</h3>
            <div style={{ 
              padding: '16px', 
              backgroundColor: '#f5f5f5', 
              borderRadius: '8px',
              fontSize: '14px',
              lineHeight: '1.6'
            }}>
              <h4>✅ 修复内容：</h4>
              <ul>
                <li><strong>恢复圆形手柄：</strong>明确设置手柄为圆形（border-radius: 50%），更自然美观</li>
                <li><strong>手柄尺寸优化：</strong>24px圆形手柄与26px开关容器比例协调</li>
                <li><strong>完美垂直居中：</strong>手柄距离顶部和底部边缘各1px，确保视觉上完美居中</li>
                <li><strong>水平位置精确：</strong>手柄距离左右边缘各1px，选中状态下精确对齐</li>
                <li><strong>阴影效果增强：</strong>为圆形手柄添加微妙阴影，增强立体感和可点击感</li>
                <li><strong>移动端圆形适配：</strong>小屏幕上手柄也是圆形，保持视觉一致性</li>
                <li><strong>动画流畅性：</strong>保持平滑的切换动画效果</li>
              </ul>
              <p><strong>测试建议：</strong>请观察开关的手柄是否在视觉上完美居中，比例是否协调</p>
            </div>
          </div>

        </Space>
      </Card>
    </div>
  );
};

export default SwitchTestPage;