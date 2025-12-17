import { apiService } from './api';

export interface NavigationStatus {
  taskId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  currentIndex: number;
  totalPoints: number;
  progress: number;
  currentPoint?: {
    pointId: string;
    pointName: string;
    position: { x: number; y: number; z: number };
    status: string;
  };
  startTime?: Date;
  endTime?: Date;
}

export interface ObstacleStatus {
  timestamp: number;
  laser_detected: boolean;
  camera_detected: boolean;
  closest_laser_distance: number | null;
  closest_depth_distance: number | null;
  status: 'CLEAR' | 'CAUTION' | 'WARNING' | 'CONFIRMED' | 'UNKNOWN';
  message: string;
  action: 'continue' | 'slow' | 'stop';
}

export const navigationApi = {
  startNavigation: async (taskId: string, startFromPoint: number = 0) => {
    return apiService.post('/navigation/start', { taskId, startFromPoint });
  },

  pauseNavigation: async (taskId: string) => {
    return apiService.post('/navigation/pause', { taskId });
  },

  resumeNavigation: async (taskId: string) => {
    return apiService.post('/navigation/resume', { taskId });
  },

  stopNavigation: async (taskId: string) => {
    return apiService.post('/navigation/stop', { taskId });
  },

  getNavigationStatus: async (taskId: string): Promise<NavigationStatus> => {
    return apiService.get(`/navigation/status/${taskId}`);
  },

  gotoPoint: async (templateId: string, pointId: string) => {
    return apiService.post('/navigation/goto-point', { templateId, pointId });
  },

  setInitialPose: async (x: number, y: number, theta: number) => {
    return apiService.post('/navigation/set-initial-pose', { x, y, theta });
  },
};

export const obstacleApi = {
  getStatus: async (): Promise<ObstacleStatus> => {
    return apiService.get('/obstacles/status');
  },

  configDetection: async (config: {
    enableFusion?: boolean;
    laserThreshold?: number;
    depthThreshold?: number;
    confirmationTimeout?: number;
  }) => {
    return apiService.post('/obstacles/config', config);
  },
};
