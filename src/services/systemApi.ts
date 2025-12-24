import { apiService } from './api';

// 系统状态接口
export interface SystemStatus {
  mode: 'idle' | 'mapping' | 'navigation' | 'supply';
  basicServices: {
    chassis: boolean;
    cmdVelMux: boolean;
    rosbridge: boolean;
    webBackend: boolean;
    webFrontend: boolean;
    systemMonitor: boolean;
  };
  functionalNodes: {
    mapping: Record<string, any>;
    navigation: Record<string, any>;
    supply: Record<string, any>;
    sensors: {
      camera: Record<string, any>;
      lidar: Record<string, any>;
      webVideo: Record<string, any>;
    };
  };
  lastModeChange: string;
  uptime: string;
  hostname?: string;
}

// 节点信息接口
export interface NodeInfo {
  nodes: string[];
}

// 话题信息接口
export interface TopicInfo {
  topics: string[];
}

// 日志信息接口
export interface LogInfo {
  logs: string[];
  lines: number;
}

// 系统API对象
export const systemApi = {
  // 获取系统状态
  getSystemStatus: () => apiService.get('/system/status'),
  
  // 获取当前模式
  getCurrentMode: () => apiService.get('/system/mode'),
  
  // 切换系统模式
  switchMode: (mode: 'idle' | 'mapping' | 'navigation' | 'supply') => 
    apiService.post('/system/switch-mode', { mode }),
  
  // 重启系统层
  restartLayer: (layer: 'basic' | 'sensor' | 'function') => 
    apiService.post('/system/restart-layer', { layer }),
  
  // 获取系统日志
  getSystemLogs: (lines: number = 100) => 
    apiService.get(`/system/logs?lines=${lines}`),
  
  // 获取节点列表
  getNodeList: () => apiService.get('/system/nodes'),
  
  // 获取话题列表
  getTopicList: () => apiService.get('/system/topics'),
};