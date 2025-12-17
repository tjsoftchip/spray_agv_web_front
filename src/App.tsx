import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { store } from './store';
import MainLayout from './components/MainLayout';
import ErrorBoundary from './components/ErrorBoundary';
import Loading from './components/Loading';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TemplateManagement = lazy(() => import('./pages/TemplateManagement'));
const TaskManagement = lazy(() => import('./pages/TaskManagement'));
const TaskQueue = lazy(() => import('./pages/TaskQueue'));
const DeviceControl = lazy(() => import('./pages/DeviceControl'));
const SupplyManagement = lazy(() => import('./pages/SupplyManagement'));
const RealTimeMonitor = lazy(() => import('./pages/RealTimeMonitor'));
const MapManagement = lazy(() => import('./pages/MapManagement'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const ScheduleManagement = lazy(() => import('./pages/ScheduleManagement'));
const NavigationMonitor = lazy(() => import('./pages/NavigationMonitor'));

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('token');
  return token ? <>{children}</> : <Navigate to="/login" replace />;
};

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <Provider store={store}>
        <ConfigProvider locale={zhCN}>
          <BrowserRouter>
            <Suspense fallback={<Loading size="large" tip="加载中..." fullscreen />}>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  path="/*"
                  element={
                    <ProtectedRoute>
                      <MainLayout>
                        <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/templates" element={<TemplateManagement />} />
                        <Route path="/tasks" element={<TaskManagement />} />
                        <Route path="/monitor" element={<RealTimeMonitor />} />
                        <Route path="/navigation-monitor" element={<NavigationMonitor />} />
                        <Route path="/maps" element={<MapManagement />} />
                        <Route path="/control" element={<DeviceControl />} />
                        <Route path="/supply" element={<SupplyManagement />} />
                        <Route path="/schedules" element={<ScheduleManagement />} />
                        <Route path="/settings" element={<SystemSettings />} />
                        <Route path="/users" element={<UserManagement />} />
                      </Routes>
                    </MainLayout>
                  </ProtectedRoute>
                }
              />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </ConfigProvider>
      </Provider>
    </ErrorBoundary>
  );
};

export default App;