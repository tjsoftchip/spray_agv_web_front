import React, { useState } from 'react';
import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { authApi } from '../services/api';
import { setCredentials } from '../store/slices/authSlice';

// 自定义样式确保输入框占满宽度
const inputStyle: React.CSSProperties = {
  width: '100% !important',
  borderRadius: '8px',
  padding: '12px 16px',
  fontSize: '16px'
};

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const response = await authApi.login(values.username, values.password);
      dispatch(setCredentials(response));
      message.success('登录成功');
      navigate('/');
    } catch (error: any) {
      message.error(error.response?.data?.error || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="login-page"
      style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '100vh',
        padding: '20px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}
    >
      <Card 
        title={
          <div style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold' }}>
            梁场养护机器人控制系统
          </div>
        } 
        style={{ 
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          borderRadius: '12px',
          overflow: 'hidden'
        }}
        styles={{
          header: { 
            background: 'linear-gradient(to right, #667eea, #764ba2)',
            color: 'white',
            border: 'none',
            padding: '20px 24px'
          },
          body: { padding: '32px 24px' }
        }}
      >
        <Form
          name="login"
          onFinish={onFinish}
          autoComplete="off"
          layout="vertical"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
            style={{ marginBottom: '20px' }}
          >
            <Input 
              prefix={<UserOutlined style={{ color: '#667eea' }} />} 
              placeholder="用户名" 
              size="large"
              style={inputStyle}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
            style={{ marginBottom: '28px' }}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#667eea' }} />}
              placeholder="密码"
              size="large"
              style={inputStyle}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: '16px' }}>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading} 
              block 
              size="large"
              style={{
                height: '48px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '500',
                background: 'linear-gradient(to right, #667eea, #764ba2)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)'
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ 
          textAlign: 'center', 
          color: 'rgba(255,255,255,0.8)', 
          fontSize: '13px',
          marginTop: '16px',
          padding: '12px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '8px'
        }}>
          默认账号: admin / admin123
        </div>
      </Card>
    </div>
  );
};

export default Login;
