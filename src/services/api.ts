import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';

const getApiBaseUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  
  if (envUrl && envUrl.startsWith('/')) {
    return `${window.location.protocol}//${window.location.hostname}:3000${envUrl}`;
  }
  
  if (envUrl) {
    return envUrl;
  }
  
  return `${window.location.protocol}//${window.location.hostname}:3000/api`;
};

const API_BASE_URL = getApiBaseUrl();

class ApiService {
  private axiosInstance: AxiosInstance;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstance.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  public async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.get(url, config);
    return response.data;
  }

  public async post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.post(url, data, config);
    return response.data;
  }

  public async put<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.put(url, data, config);
    return response.data;
  }

  public async delete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.delete(url, config);
    return response.data;
  }
}

export const apiService = new ApiService();

export const authApi = {
  login: (username: string, password: string) =>
    apiService.post('/auth/login', { username, password }),
  logout: () => apiService.post('/auth/logout'),
  refreshToken: () => apiService.post('/auth/refresh'),
};

export const templateApi = {
  getTemplates: () => apiService.get('/templates'),
  getTemplateById: (id: string) => apiService.get(`/templates/${id}`),
  createTemplate: (data: any) => apiService.post('/templates', data),
  updateTemplate: (id: string, data: any) => apiService.put(`/templates/${id}`, data),
  deleteTemplate: (id: string) => apiService.delete(`/templates/${id}`),
};

export const taskApi = {
  getTasks: () => apiService.get('/tasks'),
  getTaskById: (id: string) => apiService.get(`/tasks/${id}`),
  createTask: (data: any) => apiService.post('/tasks', data),
  updateTask: (id: string, data: any) => apiService.put(`/tasks/${id}`, data),
  deleteTask: (id: string) => apiService.delete(`/tasks/${id}`),
  executeTask: (id: string) => apiService.post(`/tasks/${id}/execute`),
  pauseTask: (id: string) => apiService.post(`/tasks/${id}/pause`),
  resumeTask: (id: string) => apiService.post(`/tasks/${id}/resume`),
  stopTask: (id: string) => apiService.post(`/tasks/${id}/stop`),
};

export const supplyStationApi = {
  getStations: () => apiService.get('/supply/stations'),
  getStationById: (id: string) => apiService.get(`/supply/stations/${id}`),
  createStation: (data: any) => apiService.post('/supply/stations', data),
  updateStation: (id: string, data: any) => apiService.put(`/supply/stations/${id}`, data),
  deleteStation: (id: string) => apiService.delete(`/supply/stations/${id}`),
};

export const robotApi = {
  getStatus: () => apiService.get('/robot/status'),
  controlMotion: (data: any) => apiService.post('/robot/motion/teleop', data),
  stopMotion: () => apiService.post('/robot/motion/stop'),
  controlSpray: (data: any) => apiService.post('/robot/control-spray', data),
  startNavigation: (goal: any) => apiService.post('/robot/start-navigation', { goal }),
  stopNavigation: () => apiService.post('/robot/stop-navigation'),
};

export const beamYardApi = {
  getYards: () => apiService.get('/beam-yards'),
  getYard: (id: string) => apiService.get(`/beam-yards/${id}`),
  createYard: (data: any) => apiService.post('/beam-yards', data),
  updateYard: (id: string, data: any) => apiService.put(`/beam-yards/${id}`, data),
  deleteYard: (id: string) => apiService.delete(`/beam-yards/${id}`),
  getPositions: (yardId: string) => apiService.get(`/beam-yards/${yardId}/positions`),
  createPosition: (yardId: string, data: any) => apiService.post(`/beam-yards/${yardId}/positions`, data),
  updatePosition: (yardId: string, posId: string, data: any) => apiService.put(`/beam-yards/${yardId}/positions/${posId}`, data),
  deletePosition: (yardId: string, posId: string) => apiService.delete(`/beam-yards/${yardId}/positions/${posId}`),
};

export const taskQueueApi = {
  getQueue: () => apiService.get('/task-queue'),
  addTask: (taskId: string) => apiService.post('/task-queue/tasks', { taskId }),
  removeTask: (taskId: string) => apiService.delete(`/task-queue/tasks/${taskId}`),
  reorder: (tasks: any[]) => apiService.put('/task-queue/reorder', { tasks }),
  start: () => apiService.post('/task-queue/start'),
  pause: () => apiService.post('/task-queue/pause'),
  resume: () => apiService.post('/task-queue/resume'),
  stop: () => apiService.post('/task-queue/stop'),
};

// 创建专门用于长时间操作的axios实例
const longTimeoutApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // 60秒超时
  headers: {
    'Content-Type': 'application/json',
  },
});

longTimeoutApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const mapApi = {
  getMaps: () => apiService.get('/maps'),
  getActiveMap: () => apiService.get('/maps/active'),
  setActiveMap: (id: string) => apiService.put(`/maps/${id}/active`),
  startMapping: () => apiService.post('/maps/start-mapping'),
  stopMapping: (data?: any) => apiService.post('/maps/stop-mapping', data),
  forceStopMapping: () => apiService.post('/maps/force-stop-mapping'),
  saveMap: (name: string) => apiService.post('/maps/save', { name }),
  loadMap: (id: string) => apiService.post(`/maps/${id}/load`),
  deleteMap: (id: string) => apiService.delete(`/maps/${id}`),
  // 本地API方法（不需要认证）
  getMappingStatusLocal: () => apiService.get('/maps/mapping-status-local'),
  startMappingLocal: () => longTimeoutApi.post('/maps/start-mapping-local'),
  stopMappingLocal: () => longTimeoutApi.post('/maps/stop-mapping-local'),
  saveMapLocal: (data: any) => longTimeoutApi.post('/maps/save-local', data),
};

export const scheduleApi = {
  getSchedules: () => apiService.get('/schedules'),
  getSchedule: (id: string) => apiService.get(`/schedules/${id}`),
  createSchedule: (data: any) => apiService.post('/schedules', data),
  updateSchedule: (id: string, data: any) => apiService.put(`/schedules/${id}`, data),
  deleteSchedule: (id: string) => apiService.delete(`/schedules/${id}`),
  enableSchedule: (id: string) => apiService.put(`/schedules/${id}/enable`),
  disableSchedule: (id: string) => apiService.put(`/schedules/${id}/disable`),
};

export const systemApi = {
  startChassis: () => apiService.post('/system/nodes/chassis/start'),
  stopChassis: () => apiService.post('/system/nodes/chassis/stop'),
  startCamera: () => apiService.post('/system/nodes/camera/start'),
  stopCamera: () => apiService.post('/system/nodes/camera/stop'),
  startLaser: () => apiService.post('/system/nodes/laser/start'),
  stopLaser: () => apiService.post('/system/nodes/laser/stop'),
  startPerception: () => apiService.post('/system/nodes/perception/start'),
  stopPerception: () => apiService.post('/system/nodes/perception/stop'),
  getConfig: () => apiService.get('/system/config'),
  updateConfig: (data: any) => apiService.put('/system/config', data),
  getLogs: () => apiService.get('/system/logs'),
};

export const userApi = {
  getUsers: () => apiService.get('/users'),
  getUser: (id: string) => apiService.get(`/users/${id}`),
  createUser: (data: any) => apiService.post('/users', data),
  updateUser: (id: string, data: any) => apiService.put(`/users/${id}`, data),
  deleteUser: (id: string) => apiService.delete(`/users/${id}`),
};
