/**
 * GPS建图API服务
 * 按照文档 web-gps-mapping-design.md 实现完整接口
 */

import { apiService } from './api';

export const gpsMappingApi = {
  // ==================== 原点校准 ====================
  
  /**
   * 开始原点校准
   */
  startOriginCalibration: () =>
    apiService.post('/gps-mapping/origin/start'),

  /**
   * 完成原点校准
   */
  completeOriginCalibration: (data: {
    latitude: number;
    longitude: number;
    altitude?: number;
    rotation?: number;
    arUcoDetected?: boolean;
  }) =>
    apiService.post('/gps-mapping/origin/complete', data),

  /**
   * 获取原点信息
   */
  getOrigin: () =>
    apiService.get('/gps-mapping/origin'),

  // ==================== 道路采集 ====================

  /**
   * 开始道路采集
   */
  startRoadRecording: (data: {
    name?: string;
    type: 'longitudinal' | 'horizontal';
    params?: {
      preferredWidth?: number;
      keepoutDistance?: number;
      channelWidth?: number;
    };
  }) =>
    apiService.post('/gps-mapping/roads/start', data),

  /**
   * 记录道路点
   */
  recordRoadPoint: (roadId: string, data: {
    latitude: number;
    longitude: number;
    altitude?: number;
  }) =>
    apiService.post(`/gps-mapping/roads/${roadId}/points`, data),

  /**
   * 结束当前道路采集
   */
  endRoadRecording: () =>
    apiService.post('/gps-mapping/roads/end'),

  /**
   * 获取所有道路
   */
  getRoads: () =>
    apiService.get('/gps-mapping/roads'),

  /**
   * 更新道路参数
   */
  updateRoad: (roadId: string, data: {
    name?: string;
    params?: {
      preferredWidth?: number;
      keepoutDistance?: number;
      channelWidth?: number;
    };
  }) =>
    apiService.put(`/gps-mapping/roads/${roadId}`, data),

  /**
   * 删除道路
   */
  deleteRoad: (roadId: string) =>
    apiService.delete(`/gps-mapping/roads/${roadId}`),

  // ==================== 交叉点自动识别 ====================

  /**
   * 生成交叉点（同时自动生成转弯路线）
   */
  generateIntersections: () =>
    apiService.post('/gps-mapping/intersections/generate'),

  /**
   * 获取所有交叉点
   */
  getIntersections: () =>
    apiService.get('/gps-mapping/intersections'),

  // ==================== 转弯路线 ====================

  /**
   * 获取所有转弯路线
   */
  getTurnPaths: () =>
    apiService.get('/gps-mapping/turn-paths'),

  // ==================== 梁位自动识别与标注 ====================

  /**
   * 自动识别梁位
   */
  generateBeamPositions: () =>
    apiService.post('/gps-mapping/beam-positions/generate'),

  /**
   * 获取所有梁位
   */
  getBeamPositions: () =>
    apiService.get('/gps-mapping/beam-positions'),

  /**
   * 更新梁位
   */
  updateBeamPosition: (beamId: string, data: {
    name?: string;
    row?: string;
    col?: number;
  }) =>
    apiService.put(`/gps-mapping/beam-positions/${beamId}`, data),

  /**
   * 删除梁位
   */
  deleteBeamPosition: (beamId: string) =>
    apiService.delete(`/gps-mapping/beam-positions/${beamId}`),

  // ==================== 地图文件生成 ====================

  /**
   * 生成地图文件
   */
  generateMapFiles: () =>
    apiService.post('/gps-mapping/generate-files'),

  /**
   * 获取建图状态
   */
  getMappingStatus: () =>
    apiService.get('/gps-mapping/status'),

  /**
   * 重置建图会话
   */
  resetMapping: () =>
    apiService.post('/gps-mapping/reset'),

  // ==================== 数据库持久化 ====================

  /**
   * 保存到数据库
   */
  saveMappingToDatabase: (data: {
    name: string;
    description?: string;
  }) =>
    apiService.post('/gps-mapping/save', data),

  /**
   * 从数据库加载
   */
  loadMappingFromDatabase: (id: string) =>
    apiService.get(`/gps-mapping/load/${id}`),

  /**
   * 获取已保存的地图列表
   */
  getSavedMaps: () =>
    apiService.get('/gps-mapping/maps'),

  /**
   * 删除已保存的地图
   */
  deleteSavedMap: (id: string) =>
    apiService.delete(`/gps-mapping/maps/${id}`),

  // ==================== 坐标转换 ====================

  /**
   * GPS坐标转地图坐标
   */
  convertGPSToMap: (latitude: number, longitude: number) =>
    apiService.post('/gps-mapping/convert/gps-to-map', { latitude, longitude }),

  /**
   * 地图坐标转GPS坐标
   */
  convertMapToGPS: (x: number, y: number) =>
    apiService.post('/gps-mapping/convert/map-to-gps', { x, y }),

  // ==================== 兼容旧API ====================

  /**
   * 获取GPS状态
   */
  getGPSStatus: () =>
    apiService.get('/gps-mapping/gps-status'),

  /**
   * 获取建图数据（兼容旧API）
   */
  getMappingData: () =>
    apiService.get('/gps-mapping/status'),

  /**
   * 保存建图数据（兼容旧API）
   */
  saveMappingData: (data: any) =>
    apiService.post('/gps-mapping/save', data),

  /**
   * 开始GPS建图（兼容旧API）
   */
  startMapping: () =>
    apiService.post('/gps-mapping/origin/start'),

  /**
   * 停止GPS建图（兼容旧API）
   */
  stopMapping: () =>
    apiService.post('/gps-mapping/roads/end'),

  /**
   * 记录路线点（兼容旧API）
   */
  recordWaypoint: (point: any) =>
    apiService.post('/gps-mapping/route-points', point),

  /**
   * 标记转弯点（兼容旧API - 已废弃）
   */
  markTurnPoint: (point: any) =>
    apiService.post('/gps-mapping/turn-points', point),

  /**
   * 标记梁位置（兼容旧API）
   */
  markBeamPosition: (beam: any) =>
    apiService.post('/gps-mapping/beam-positions', beam),

  /**
   * 删除路线点（兼容旧API）
   */
  deleteWaypoint: (id: string) =>
    apiService.delete(`/gps-mapping/route-points/${id}`),

  /**
   * 导出地图文件
   */
  exportMap: (format: 'yaml' | 'json' = 'json') =>
    apiService.get(`/gps-mapping/generate-files`),

  /**
   * 生成预设路线（兼容旧API）
   */
  generateRoutes: (beamPositions: any[]) =>
    apiService.post('/gps-mapping/beam-positions/generate', { beamPositions }),

  /**
   * 生成转弯点位（兼容旧API - 已废弃）
   */
  generateTurnPoints: (routes: any[]) =>
    apiService.post('/gps-mapping/intersections/generate', { routes }),

  /**
   * 设置GPS原点
   */
  setOrigin: (latitude: number, longitude: number, rotation: number = 0) =>
    apiService.post('/gps-mapping/origin/complete', { latitude, longitude, rotation }),

  /**
   * 坐标转换（兼容旧API）
   */
  convertCoordinates: (lat: number, lon: number) =>
    apiService.post('/gps-mapping/convert/gps-to-map', { latitude: lat, longitude: lon }),
};

/**
 * 作业规划API
 */
export const jobPlanningApi = {
  /**
   * 获取梁位列表
   */
  getBeamPositions: () =>
    apiService.get('/job-planning/beam-positions'),

  /**
   * 规划作业路线
   * 根据选择的梁位自动生成最优路线
   */
  planRoutes: (beamPositionIds: string[]) =>
    apiService.post('/job-planning/plan-routes', { beamPositionIds }),

  /**
   * 执行作业
   */
  executeJob: (routeId: string, beamPositionIds: string[]) =>
    apiService.post('/job-planning/execute', { routeId, beamPositionIds }),

  /**
   * 暂停作业
   */
  pauseJob: () =>
    apiService.post('/job-planning/pause'),

  /**
   * 恢复作业
   */
  resumeJob: () =>
    apiService.post('/job-planning/resume'),

  /**
   * 停止作业
   */
  stopJob: () =>
    apiService.post('/job-planning/stop'),

  /**
   * 获取作业状态
   */
  getJobStatus: () =>
    apiService.get('/job-planning/status'),

  /**
   * 获取作业历史
   */
  getJobHistory: () =>
    apiService.get('/job-planning/history'),
};

export default gpsMappingApi;