/**
 * GPS建图API服务
 * 与后端gpsMappingController完全对齐
 */

import { apiService } from './api';

export const gpsMappingApi = {
  // ==================== 原点校准 ====================

  startOriginCalibration: () =>
    apiService.post('/gps-mapping/origin/start'),

  completeOriginCalibration: (data: {
    latitude: number;
    longitude: number;
    altitude?: number;
    rotation?: number;
    arUcoDetected?: boolean;
  }) =>
    apiService.post('/gps-mapping/origin/complete', data),

  getOrigin: () =>
    apiService.get('/gps-mapping/origin'),

  // ==================== 道路采集 ====================

  startRoadRecording: (data: {
    name?: string;
    type: 'longitudinal' | 'horizontal';
    params?: {
      preferredWidth?: number;
      highCostWidth?: number;
    };
  }) =>
    apiService.post('/gps-mapping/roads/start', data),

  recordRoadPoint: (roadId: string, data: {
    latitude: number;
    longitude: number;
    altitude?: number;
  }) =>
    apiService.post(`/gps-mapping/roads/${roadId}/points`, data),

  endRoadRecording: () =>
    apiService.post('/gps-mapping/roads/end'),

  getRoads: () =>
    apiService.get('/gps-mapping/roads'),

  updateRoad: (roadId: string, data: {
    name?: string;
    params?: {
      preferredWidth?: number;
      highCostWidth?: number;
    };
  }) =>
    apiService.put(`/gps-mapping/roads/${roadId}`, data),

  deleteRoad: (roadId: string) =>
    apiService.delete(`/gps-mapping/roads/${roadId}`),

  // ==================== 交叉点与圆弧生成 ====================

  generateIntersections: () =>
    apiService.post('/gps-mapping/intersections/generate'),

  getIntersections: () =>
    apiService.get('/gps-mapping/intersections'),

  getTurnArcs: () =>
    apiService.get('/gps-mapping/turn-arcs'),

  // ==================== 梁位 ====================

  generateBeamPositions: () =>
    apiService.post('/gps-mapping/beam-positions/generate'),

  getBeamPositions: () =>
    apiService.get('/gps-mapping/beam-positions'),

  updateBeamPosition: (beamId: string, data: {
    name?: string;
    row?: string;
    col?: number;
  }) =>
    apiService.put(`/gps-mapping/beam-positions/${beamId}`, data),

  deleteBeamPosition: (beamId: string) =>
    apiService.delete(`/gps-mapping/beam-positions/${beamId}`),

  // ==================== 地图文件生成 ====================

  generateMapFiles: () =>
    apiService.post('/gps-mapping/generate-files'),

  // ==================== 建图状态 ====================

  getMappingStatus: () =>
    apiService.get('/gps-mapping/status'),

  resetMapping: () =>
    apiService.post('/gps-mapping/reset'),

  // ==================== 数据库持久化 ====================

  saveMappingToDatabase: (data: {
    name: string;
    description?: string;
  }) =>
    apiService.post('/gps-mapping/save', data),

  loadMappingFromDatabase: (id: string) =>
    apiService.get(`/gps-mapping/load/${id}`),

  getSavedMaps: () =>
    apiService.get('/gps-mapping/maps'),

  deleteSavedMap: (id: string) =>
    apiService.delete(`/gps-mapping/maps/${id}`),

  // ==================== 坐标转换 ====================

  convertGPSToMap: (latitude: number, longitude: number) =>
    apiService.post('/gps-mapping/convert/gps-to-map', { latitude, longitude }),

  convertMapToGPS: (x: number, y: number) =>
    apiService.post('/gps-mapping/convert/map-to-gps', { x, y }),

  // ==================== GPS状态 ====================

  getGPSStatus: () =>
    apiService.get('/gps-mapping/gps-status'),

  // ==================== 数据导出 ====================

  exportRawGPSData: () =>
    apiService.get('/gps-mapping/export-raw'),

  getSessionDebug: () =>
    apiService.get('/gps-mapping/debug'),
};

/**
 * 作业规划API
 */
export const jobPlanningApi = {
  getBeamPositions: () =>
    apiService.get('/job/beam-positions'),

  planRoutes: (beamPositionIds: string[]) =>
    apiService.post('/job/plan-routes', { beamPositionIds }),

  executeJob: (routeId: string, beamPositionIds: string[]) =>
    apiService.post('/job/execute', { routeId, beamPositionIds }),

  pauseJob: () =>
    apiService.post('/job/pause'),

  resumeJob: () =>
    apiService.post('/job/resume'),

  stopJob: () =>
    apiService.post('/job/stop'),

  getJobStatus: () =>
    apiService.get('/job/status'),

  getJobHistory: () =>
    apiService.get('/job/history'),
};

export default gpsMappingApi;
