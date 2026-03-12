import React, { useState, useEffect } from 'react';
import { Layout, Menu, Button, Avatar, Dropdown, message, Tag, Tooltip } from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DashboardOutlined,
  FileTextOutlined,
  UnorderedListOutlined,
  ControlOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MonitorOutlined,
  ExclamationCircleOutlined,
  ReloadOutlined,
  BranchesOutlined,
  EnvironmentOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { logout } from '../store/slices/authSlice';
import type { RootState } from '../store';
import { socketService } from '../services/socket';
import { apiService } from '../services/api';

const { Header, Sider, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [emergencyActive, setEmergencyActive] = useState(false);
  // GPS状态
  const [gpsStatus, setGpsStatus] = useState<{
    quality: number;
    satellites: number;
    isFixed: boolean;
  } | null>(null);
  // 电池和水位状态
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [waterLevel, setWaterLevel] = useState<number | null>(null);
  
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.auth.user);

  // 初始化socket连接
  useEffect(() => {
    socketService.connect();
    
    // 订阅紧急停止状态话题
    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/emergency_stop_status',
      type: 'std_msgs/msg/Bool'
    });
    
    // 订阅GPS状态（JSON格式）
    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/gps/status',
      type: 'std_msgs/String'
    });
    
    // 订阅电池状态
    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/battery_level',
      type: 'std_msgs/msg/Float32'
    });
    
    // 订阅水位状态
    socketService.sendRosCommand({
      op: 'subscribe',
      topic: '/water_level',
      type: 'std_msgs/msg/Float32'
    });
    
    return () => {
      // 取消订阅
      socketService.sendRosCommand({
        op: 'unsubscribe',
        topic: '/emergency_stop_status'
      });
      socketService.sendRosCommand({
        op: 'unsubscribe',
        topic: '/gps/status'
      });
      socketService.sendRosCommand({
        op: 'unsubscribe',
        topic: '/battery_level'
      });
      socketService.sendRosCommand({
        op: 'unsubscribe',
        topic: '/water_level'
      });
      socketService.disconnect();
    };
  }, []);

  // 监听紧急停止状态变化
  useEffect(() => {
    socketService.onRosMessage((data) => {
      if (data.topic === '/emergency_stop_status') {
        const isActive = data.msg.data;
        setEmergencyActive(isActive);
      } else if (data.topic === '/gps/status') {
        // GPS状态（JSON格式）
        try {
          const statusStr = data.msg.data || data.msg;
          const status = typeof statusStr === 'string' ? JSON.parse(statusStr) : statusStr;
          const quality = status.quality || 0;
          const satellites = status.satellites || 0;
          setGpsStatus({
            quality,
            satellites,
            isFixed: quality === 4 || quality === 5
          });
        } catch (e) {
          console.error('Failed to parse GPS status:', e);
        }
      } else if (data.topic === '/battery_level') {
        setBatteryLevel(data.msg.data);
      } else if (data.topic === '/water_level') {
        setWaterLevel(data.msg.data);
      }
    });
  }, []);

  const menuItems = [
    {
      key: '/monitor',
      icon: <DashboardOutlined />,
      label: '状态监控',
    },
    {
      key: '/templates',
      icon: <FileTextOutlined />,
      label: '模板管理',
    },
    {
      key: '/tasks',
      icon: <UnorderedListOutlined />,
      label: '任务管理',
    },
    {
      key: '/maps',
      icon: <FileTextOutlined />,
      label: '地图管理',
    },
    {
      key: '/gps-mapping',
      icon: <EnvironmentOutlined />,
      label: 'GPS建图',
    },
    {
      key: '/control',
      icon: <ControlOutlined />,
      label: '设备控制',
    },
    {
      key: '/supply',
      icon: <ThunderboltOutlined />,
      label: '补给管理',
    },
    {
      key: '/system',
      icon: <MonitorOutlined />,
      label: '系统监控',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
    {
      key: '/users',
      icon: <UserOutlined />,
      label: '用户管理',
    },
  ];

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  // 紧急停止
  const handleEmergencyStop = async () => {
    try {
      const result = await apiService.post('/robot/emergency-stop', { action: 'stop' });
      message.warning(result.message || '⚠️ 紧急停止已激活 - 所有运动和喷淋已停止');
      setEmergencyActive(true);

      // 同时发布ROS2消息作为备用
      socketService.sendRosCommand({
        op: 'call_service',
        service: '/emergency_stop',
        args: { data: true }
      });
    } catch (error) {
      console.error('Emergency stop error:', error);
      message.error('紧急停止请求失败');

      // API失败时尝试直接ROS2调用
      socketService.sendRosCommand({
        op: 'call_service',
        service: '/emergency_stop',
        args: { data: true }
      });
    }
  };

  // 复位紧急停止
  const handleEmergencyReset = async () => {
    try {
      const result = await apiService.post('/robot/emergency-stop', { action: 'reset' });
      message.success(result.message || '✅ 紧急停止已复位 - 系统可正常操作');
      setEmergencyActive(false);

      // 同时发布ROS2消息作为备用
      socketService.sendRosCommand({
        op: 'call_service',
        service: '/emergency_stop',
        args: { data: false }
      });
    } catch (error) {
      console.error('Emergency reset error:', error);
      message.error('紧急停止复位请求失败');

      // API失败时尝试直接ROS2调用
      socketService.sendRosCommand({
        op: 'call_service',
        service: '/emergency_stop',
        args: { data: false }
      });
    }
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider trigger={null} collapsible collapsed={collapsed}>
        <div style={{ 
          height: '64px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'white',
          fontSize: '18px',
          fontWeight: 'bold',
        }}>
          {collapsed ? '养护' : '梁场养护机器人'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ 
          padding: '0 16px', 
          background: '#fff', 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: '16px', width: 64, height: 64 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* GPS状态 */}
            <Tooltip title={gpsStatus ? `GPS状态: ${gpsStatus.isFixed ? 'RTK固定解' : '未定位'} | 卫星数: ${gpsStatus.satellites}` : '等待GPS数据'}>
              <Tag 
                icon={<GlobalOutlined />}
                color={gpsStatus?.isFixed ? 'success' : 'error'}
                style={{ margin: 0, padding: '4px 8px', fontSize: '13px' }}
              >
                GPS: {gpsStatus?.isFixed ? 'FIXED' : '未定位'}
              </Tag>
            </Tooltip>
            
            {/* 电池状态 */}
            <Tooltip title={`电池电量: ${batteryLevel !== null ? batteryLevel.toFixed(0) + '%' : '未知'}`}>
              <Tag 
                color={batteryLevel === null ? 'default' : batteryLevel > 50 ? 'success' : batteryLevel > 20 ? 'warning' : 'error'}
                style={{ margin: 0, padding: '4px 8px', fontSize: '13px' }}
              >
                电量: {batteryLevel !== null ? batteryLevel.toFixed(0) + '%' : '--'}
              </Tag>
            </Tooltip>
            
            {/* 水位状态 */}
            <Tooltip title={`水箱水位: ${waterLevel !== null ? waterLevel.toFixed(0) + '%' : '未知'}`}>
              <Tag 
                color={waterLevel === null ? 'default' : waterLevel > 50 ? 'success' : waterLevel > 20 ? 'warning' : 'error'}
                style={{ margin: 0, padding: '4px 8px', fontSize: '13px' }}
              >
                水位: {waterLevel !== null ? waterLevel.toFixed(0) + '%' : '--'}
              </Tag>
            </Tooltip>
            
            {/* 紧急停止按钮 */}
            <Button
              type="primary"
              danger={!emergencyActive}
              size="large"
              icon={emergencyActive ? <ReloadOutlined /> : <ExclamationCircleOutlined />}
              onClick={emergencyActive ? handleEmergencyReset : handleEmergencyStop}
              style={{
                backgroundColor: emergencyActive ? '#52c41a' : '#ff4d4f',
                borderColor: emergencyActive ? '#52c41a' : '#ff4d4f',
                fontWeight: 600,
                minWidth: 120,
                height: 40,
                borderRadius: 6,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {emergencyActive ? '✅ 复位' : '⚠️ 紧急停止'}
            </Button>
            
            {/* 用户下拉菜单 */}
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Avatar icon={<UserOutlined />} />
                <span>{user?.username}</span>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: '24px 16px', padding: 24, background: '#fff', minHeight: 280 }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
