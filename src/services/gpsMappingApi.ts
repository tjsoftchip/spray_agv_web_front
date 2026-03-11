import { apiService } from './api';

// GPS建图API
export const gpsMappingApi = {
  // 获取建图数据
  getMappingData: () => 
    apiService.get('/gps-mapping/data'),
  
  // 保存建图数据
  saveMappingData: (data: any) => 
    apiService.post('/gps-mapping/save', data),
  
  // 开始GPS建图
  startMapping: () => 
    apiService.post('/gps-mapping/start'),
  
  // 停止GPS建图
  stopMapping: () => 
    apiService.post('/gps-mapping/stop'),
  
  // 获取GPS状态
  getGPSStatus: () => 
    apiService.get('/gps-mapping/status'),
  
  // 记录路线点
  recordWaypoint: (point: any) => 
    apiService.post('/gps-mapping/waypoint', point),
  
  // 标记转弯点
  markTurnPoint: (point: any) => 
    apiService.post('/gps-mapping/turn-point', point),
  
  // 标记梁位置
  markBeamPosition: (beam: any) => 
    apiService.post('/gps-mapping/beam-position', beam),
  
  // 删除路线点
  deleteWaypoint: (id: string) => 
    apiService.delete(`/gps-mapping/waypoint/${id}`),
  
  // 删除梁位置
  deleteBeamPosition: (id: string) => 
    apiService.delete(`/gps-mapping/beam-position/${id}`),
  
  // 导出地图文件
  exportMap: (format: 'yaml' | 'json' = 'json') => 
    apiService.get(`/gps-mapping/export?format=${format}`),
  
  // 生成预设路线
  generateRoutes: (beamPositions: any[]) => 
    apiService.post('/gps-mapping/generate-routes', { beamPositions }),
  
  // 生成转弯点位
  generateTurnPoints: (routes: any[]) => 
    apiService.post('/gps-mapping/generate-turn-points', { routes }),
  
  // 获取所有已保存的地图列表
  getSavedMaps: () => 
    apiService.get('/gps-mapping/maps'),
  
  // 加载指定地图
  loadMap: (id: string) => 
    apiService.get(`/gps-mapping/maps/${id}`),
  
  // 删除指定地图
  deleteMap: (id: string) => 
    apiService.delete(`/gps-mapping/maps/${id}`),
  
  // 设置GPS原点
  setOrigin: (latitude: number, longitude: number, rotation: number = 0) => 
    apiService.post('/gps-mapping/origin', { latitude, longitude, rotation }),
  
  // 获取GPS原点
  getOrigin: () => 
    apiService.get('/gps-mapping/origin'),
  
  // 坐标转换
  convertCoordinates: (lat: number, lon: number) => 
    apiService.post('/gps-mapping/convert', { latitude: lat, longitude: lon }),
};

export default gpsMappingApi;
