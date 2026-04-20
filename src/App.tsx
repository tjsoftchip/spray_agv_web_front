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
const TaskManagement = lazy(() => import('./pages/TaskManagement'));
const DeviceControl = lazy(() => import('./pages/DeviceControl'));
const SupplyManagement = lazy(() => import('./pages/SupplyManagement'));
const MapManagement = lazy(() => import('./pages/MapManagement'));
const SystemSettings = lazy(() => import('./pages/SystemSettings'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const StatusMonitor = lazy(() => import('./pages/StatusMonitor'));
const SystemMonitor = lazy(() => import('./pages/SystemMonitor'));
const GPSMapping = lazy(() => import('./pages/GPSMapping'));

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
                        <Route path="/" element={<Navigate to="/monitor" replace />} />
                        <Route path="/tasks" element={<TaskManagement />} />
                        <Route path="/monitor" element={<StatusMonitor />} />
                        <Route path="/status" element={<StatusMonitor />} />
                        <Route path="/status-monitor" element={<StatusMonitor />} />
                        <Route path="/maps" element={<MapManagement />} />
                        <Route path="/gps-mapping" element={<GPSMapping />} />
                        <Route path="/control" element={<DeviceControl />} />
                        <Route path="/supply" element={<SupplyManagement />} />
                        <Route path="/settings" element={<SystemSettings />} />
                        <Route path="/users" element={<UserManagement />} />
                        <Route path="/system" element={<SystemMonitor />} />
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