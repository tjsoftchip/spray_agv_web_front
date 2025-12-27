import React, { useState, useEffect } from 'react';
import { Card, Form, InputNumber, Button, Space, Select, Row, Col, message, Spin, Divider, Tag, Alert, Collapse, Radio, Slider, Input, Progress, Modal } from 'antd';
import { PlayCircleOutlined, SaveOutlined, DownloadOutlined, ReloadOutlined, EyeOutlined, SettingOutlined, StopOutlined, CheckCircleOutlined, SyncOutlined } from '@ant-design/icons';
import PGMMapViewer from '../components/PGMMapViewer';
import { apiService } from '../services/api';

interface PathPoint {
  x: number;
  y: number;
  z?: number;
}

interface GeneratedPath {
  points: PathPoint[];
  metadata: {
    method: string;
    totalLength: number;
    estimatedTime: number;
    turnCount: number;
  };
  pathId?: string;
}

interface TaskStatus {
  taskId: string;
  pathId: string;
  mode: string;
  status: string;
  start_time: number;
  end_time: number;
  progress: number;
  total_length: number;
  estimated_time: number;
  error_message: string;
}

interface CoverageArea {
  type: 'rectangle' | 'corridor' | 'custom';
  corners?: PathPoint[];
  startPoint?: PathPoint;
  endPoint?: PathPoint;
  width?: number;
}

const PathAutoGenerator: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewPath, setPreviewPath] = useState<PathPoint[]>([]);
  const [generatedPath, setGeneratedPath] = useState<GeneratedPath | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string>('');
  const [maps, setMaps] = useState<any[]>([]);
  const [coverageMode, setCoverageMode] = useState<'rectangle' | 'corridor'>('rectangle');
  const [selectedCorners, setSelectedCorners] = useState<PathPoint[]>([]);
  const [selectedStartPoint, setSelectedStartPoint] = useState<PathPoint | null>(null);
  const [selectedEndPoint, setSelectedEndPoint] = useState<PathPoint | null>(null);
  const [pathParams, setPathParams] = useState({
    sampleDistance: 0.2,
    minTurnRadius: 0.5,
    maxTurnRadius: 2.0,
    lineSpacing: 0.5,
    overlapRatio: 0.1,
    turnMethod: 'bezier',
    centerlineMethod: 'distance_field',
  });
  const [taskMode, setTaskMode] = useState<'spray' | 'resupply' | 'patrol'>('spray');
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null);
  const [taskExecuting, setTaskExecuting] = useState(false);
  const [taskProgress, setTaskProgress] = useState(0);

  useEffect(() => {
    loadMaps();
  }, []);

  const loadMaps = async () => {
    try {
      const data = await apiService.get('/maps/scan-local');
      setMaps(data);
      if (data.length > 0) {
        setSelectedMapId(data[0].name);
      }
    } catch (error) {
      console.error('Failed to load maps:', error);
      message.error('加载地图列表失败');
    }
  };

  const handleMapClick = (position: { x: number; y: number }) => {
    if (coverageMode === 'rectangle') {
      if (selectedCorners.length < 4) {
        const newCorner = { x: position.x, y: position.y, z: 0 };
        setSelectedCorners([...selectedCorners, newCorner]);
        message.success(`已添加第 ${selectedCorners.length + 1} 个角点`);
      } else {
        message.warning('矩形区域已选择4个角点，请点击"清除选择"重新选择');
      }
    } else if (coverageMode === 'corridor') {
      if (!selectedStartPoint) {
        setSelectedStartPoint({ x: position.x, y: position.y, z: 0 });
        message.success('已设置起点');
      } else if (!selectedEndPoint) {
        setSelectedEndPoint({ x: position.x, y: position.y, z: 0 });
        message.success('已设置终点');
      } else {
        message.warning('走廊路径已设置起点和终点，请点击"清除选择"重新选择');
      }
    }
  };

  const handleClearSelection = () => {
    setSelectedCorners([]);
    setSelectedStartPoint(null);
    setSelectedEndPoint(null);
    setPreviewPath([]);
    setGeneratedPath(null);
    message.info('已清除所有选择');
  };

  const handleGeneratePath = async () => {
    if (coverageMode === 'rectangle' && selectedCorners.length !== 4) {
      message.error('请选择4个角点以定义矩形区域');
      return;
    }
    if (coverageMode === 'corridor' && (!selectedStartPoint || !selectedEndPoint)) {
      message.error('请选择起点和终点以定义走廊路径');
      return;
    }
    if (!selectedMapId) {
      message.error('请先选择地图');
      return;
    }

    setGenerating(true);
    try {
      const payload = {
        mapId: selectedMapId,
        mode: coverageMode,
        params: pathParams,
        coverageArea: {
          type: coverageMode,
          corners: coverageMode === 'rectangle' ? selectedCorners : undefined,
          startPoint: coverageMode === 'corridor' ? selectedStartPoint : undefined,
          endPoint: coverageMode === 'corridor' ? selectedEndPoint : undefined,
          width: coverageMode === 'corridor' ? pathParams.lineSpacing * 2 : undefined,
        },
      };

      const result = await apiService.post('/path/generate-auto', payload);
      setGeneratedPath(result);
      setPreviewPath(result.points);
      message.success('路径生成成功');
      
      // 自动保存路径
      const pathName = form.getFieldValue('pathName') || `path_${Date.now()}`;
      try {
        await apiService.post('/path/save', {
          name: pathName,
          mapId: selectedMapId,
          points: result.points,
          metadata: result.metadata,
        });
        message.success('路径已自动保存并生成nav2_routes.yaml文件');
      } catch (error) {
        console.error('Failed to auto-save path:', error);
        message.warning('路径生成成功但自动保存失败');
      }
    } catch (error: any) {
      console.error('Failed to generate path:', error);
      message.error(error.response?.data?.message || '路径生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleSavePath = async () => {
    if (!generatedPath) {
      message.error('请先生成路径');
      return;
    }

    const pathName = form.getFieldValue('pathName');
    if (!pathName) {
      message.error('请输入路径名称');
      return;
    }

    setLoading(true);
    try {
      await apiService.post('/path/save', {
        name: pathName,
        mapId: selectedMapId,
        points: generatedPath.points,
        metadata: generatedPath.metadata,
      });
      message.success('路径保存成功');
    } catch (error) {
      console.error('Failed to save path:', error);
      message.error('路径保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPath = () => {
    if (!generatedPath) {
      message.error('请先生成路径');
      return;
    }

    const yamlContent = generateYAMLContent(generatedPath);
    const blob = new Blob([yamlContent], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${form.getFieldValue('pathName') || 'path'}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('路径已导出');
  };

  const handleStartTask = async () => {
    if (!generatedPath || !generatedPath.pathId) {
      message.error('请先生成并保存路径');
      return;
    }

    Modal.confirm({
      title: '确认启动任务',
      content: `即将启动${taskMode === 'spray' ? '喷水养护' : taskMode === 'resupply' ? '补给' : '巡逻'}任务，是否继续？`,
      okText: '启动',
      cancelText: '取消',
      onOk: async () => {
        setTaskExecuting(true);
        try {
          const result = await apiService.post('/path-sm/start', {
            taskId: `task_${Date.now()}`,
            pathId: generatedPath.pathId,
            mode: taskMode,
          });
          message.success(result.message || '任务启动成功');
          
          await pollTaskStatus();
        } catch (error: any) {
          console.error('Failed to start task:', error);
          message.error(error.response?.data?.message || '任务启动失败');
          setTaskExecuting(false);
        }
      },
    });
  };

  const handleCompleteTask = async () => {
    if (!taskExecuting) {
      message.error('没有正在执行的任务');
      return;
    }

    try {
      const result = await apiService.post('/path-sm/complete', {});
      message.success(result.message || '任务已完成');
      setTaskExecuting(false);
      setTaskProgress(100);
    } catch (error: any) {
      console.error('Failed to complete task:', error);
      message.error(error.response?.data?.message || '任务完成失败');
    }
  };

  const handleAbortTask = async () => {
    if (!taskExecuting) {
      message.error('没有正在执行的任务');
      return;
    }

    Modal.confirm({
      title: '确认中止任务',
      content: '即将中止当前任务，是否继续？',
      okText: '中止',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await apiService.post('/path-sm/abort', {});
          message.success(result.message || '任务已中止');
          setTaskExecuting(false);
          setTaskProgress(0);
        } catch (error: any) {
          console.error('Failed to abort task:', error);
          message.error(error.response?.data?.message || '任务中止失败');
        }
      },
    });
  };

  const pollTaskStatus = async () => {
    const interval = setInterval(async () => {
      try {
        const result = await apiService.get('/path-sm/status');
        if (result.success && result.taskStatus) {
          setTaskStatus(result.taskStatus);
          setTaskProgress(result.taskStatus.progress);
          
          if (result.taskStatus.status === 'completed' || 
              result.taskStatus.status === 'aborted' || 
              result.taskStatus.status === 'failed') {
            clearInterval(interval);
            setTaskExecuting(false);
            
            if (result.taskStatus.status === 'completed') {
              message.success('任务执行完成');
            } else if (result.taskStatus.status === 'aborted') {
              message.warning('任务已中止');
            } else if (result.taskStatus.status === 'failed') {
              message.error(`任务执行失败: ${result.taskStatus.error_message}`);
            }
          }
        }
      } catch (error) {
        console.error('Failed to poll task status:', error);
      }
    }, 2000);
  };

  const generateYAMLContent = (path: GeneratedPath): string => {
    let yaml = `path_name: ${form.getFieldValue('pathName') || 'path'}\n`;
    yaml += `map_id: ${selectedMapId}\n`;
    yaml += `metadata:\n`;
    yaml += `  method: ${path.metadata.method}\n`;
    yaml += `  total_length: ${path.metadata.totalLength.toFixed(2)}\n`;
    yaml += `  estimated_time: ${path.metadata.estimatedTime.toFixed(2)}\n`;
    yaml += `  turn_count: ${path.metadata.turnCount}\n`;
    yaml += `points:\n`;
    path.points.forEach((point, index) => {
      yaml += `  - id: ${index + 1}\n`;
      yaml += `    position:\n`;
      yaml += `      x: ${point.x.toFixed(6)}\n`;
      yaml += `      y: ${point.y.toFixed(6)}\n`;
      yaml += `      z: ${(point.z || 0).toFixed(6)}\n`;
    });
    return yaml;
  };

  const renderPathInfo = () => {
    if (!generatedPath) return null;

    return (
      <Card title="路径信息" size="small" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Tag color="blue">路径点数: {generatedPath.points.length}</Tag>
          </Col>
          <Col span={6}>
            <Tag color="green">总长度: {generatedPath.metadata.totalLength.toFixed(2)}m</Tag>
          </Col>
          <Col span={6}>
            <Tag color="orange">预计时间: {generatedPath.metadata.estimatedTime.toFixed(2)}s</Tag>
          </Col>
          <Col span={6}>
            <Tag color="purple">转弯次数: {generatedPath.metadata.turnCount}</Tag>
          </Col>
        </Row>
      </Card>
    );
  };

  const renderTaskControl = () => {
    return (
      <Card title="任务执行控制" size="small" style={{ marginTop: 16 }}>
        <Form layout="vertical">
          <Form.Item label="任务模式">
            <Select
              value={taskMode}
              onChange={setTaskMode}
              disabled={taskExecuting}
              style={{ width: '100%' }}
            >
              <Select.Option value="spray">喷水养护</Select.Option>
              <Select.Option value="resupply">补给</Select.Option>
              <Select.Option value="patrol">巡逻</Select.Option>
            </Select>
          </Form.Item>

          {taskExecuting && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span>任务进度</span>
                <span>{taskProgress.toFixed(1)}%</span>
              </div>
              <Progress 
                percent={taskProgress} 
                status={taskProgress >= 100 ? 'success' : 'active'}
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
              />
            </div>
          )}

          {taskStatus && (
            <div style={{ marginBottom: 16 }}>
              <Row gutter={8}>
                <Col span={12}>
                  <Tag color={taskStatus.status === 'executing' ? 'processing' : 'default'}>
                    状态: {taskStatus.status}
                  </Tag>
                </Col>
                <Col span={12}>
                  <Tag color="blue">
                    模式: {taskStatus.mode}
                  </Tag>
                </Col>
              </Row>
            </div>
          )}

          <Space vertical style={{ width: '100%' }}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStartTask}
              disabled={taskExecuting || !generatedPath}
              block
              size="large"
            >
              启动任务
            </Button>

            <Button
              icon={<CheckCircleOutlined />}
              onClick={handleCompleteTask}
              disabled={!taskExecuting}
              block
            >
              完成任务
            </Button>

            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleAbortTask}
              disabled={!taskExecuting}
              block
            >
              中止任务
            </Button>
          </Space>
        </Form>
      </Card>
    );
  };

  const renderRectangleMode = () => (
    <Card title="矩形覆盖区域选择" size="small">
      <Alert
        title="请在地图上依次点击选择4个角点（按顺时针或逆时针顺序）"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Space vertical style={{ width: '100%' }}>
        {selectedCorners.map((corner, index) => (
          <Tag key={index} color="blue">
            角点{index + 1}: ({corner.x.toFixed(2)}, {corner.y.toFixed(2)})
          </Tag>
        ))}
        {selectedCorners.length === 0 && <Tag>未选择角点</Tag>}
      </Space>
    </Card>
  );

  const renderCorridorMode = () => (
    <Card title="走廊覆盖路径选择" size="small">
      <Alert
        title="请在地图上依次点击选择起点和终点"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Space vertical style={{ width: '100%' }}>
        {selectedStartPoint && (
          <Tag color="green">
            起点: ({selectedStartPoint.x.toFixed(2)}, {selectedStartPoint.y.toFixed(2)})
          </Tag>
        )}
        {selectedEndPoint && (
          <Tag color="red">
            终点: ({selectedEndPoint.x.toFixed(2)}, {selectedEndPoint.y.toFixed(2)})
          </Tag>
        )}
        {!selectedStartPoint && !selectedEndPoint && <Tag>未选择起点和终点</Tag>}
      </Space>
    </Card>
  );

  return (
    <div style={{ padding: 24 }}>
      <Row gutter={16}>
        <Col span={16}>
          <Card title="地图预览" extra={
            <Space>
              <Button icon={<ReloadOutlined />} onClick={handleClearSelection}>
                清除选择
              </Button>
              <Select
                style={{ width: 200 }}
                placeholder="选择地图"
                value={selectedMapId}
                onChange={setSelectedMapId}
                options={maps.map(map => ({ label: map.name, value: map.name }))}
              />
            </Space>
          }>
            <PGMMapViewer
              onMapClick={handleMapClick}
              selectedMapId={selectedMapId}
              onMapChange={setSelectedMapId}
              height="600px"
              showMapSelector={false}
            />
            {previewPath.length > 0 && (
              <Alert
                title={`已生成路径预览，共 ${previewPath.length} 个路径点`}
                type="success"
                showIcon
                style={{ marginTop: 16 }}
              />
            )}
          </Card>
        </Col>

        <Col span={8}>
          <Card title="路径生成配置" extra={<SettingOutlined />}>
            <Form form={form} layout="vertical">
              <Form.Item label="路径名称" name="pathName" rules={[{ required: true, message: '请输入路径名称' }]}>
                <Input placeholder="例如: 矩形区域1" />
              </Form.Item>

              <Divider>覆盖模式</Divider>
              <Form.Item label="覆盖模式">
                <Radio.Group value={coverageMode} onChange={(e) => {
                  setCoverageMode(e.target.value);
                  handleClearSelection();
                }}>
                  <Radio.Button value="rectangle">矩形覆盖</Radio.Button>
                  <Radio.Button value="corridor">走廊覆盖</Radio.Button>
                </Radio.Group>
              </Form.Item>

              {coverageMode === 'rectangle' ? renderRectangleMode() : renderCorridorMode()}

              <Divider>路径参数</Divider>

              <Collapse 
                size="small" 
                defaultActiveKey={['basic']}
                items={[
                  {
                    key: 'basic',
                    label: '基本参数',
                    children: (
                      <>
                        <Form.Item label="采样距离 (m)">
                          <Slider
                            min={0.1}
                            max={1.0}
                            step={0.05}
                            value={pathParams.sampleDistance}
                            onChange={(value) => setPathParams({ ...pathParams, sampleDistance: value })}
                            marks={{ 0.1: '0.1', 0.5: '0.5', 1.0: '1.0' }}
                          />
                        </Form.Item>

                        <Form.Item label="线间距 (m)">
                          <Slider
                            min={0.2}
                            max={2.0}
                            step={0.1}
                            value={pathParams.lineSpacing}
                            onChange={(value) => setPathParams({ ...pathParams, lineSpacing: value })}
                            marks={{ 0.2: '0.2', 1.0: '1.0', 2.0: '2.0' }}
                          />
                        </Form.Item>

                        <Form.Item label="重叠比例">
                          <Slider
                            min={0}
                            max={0.3}
                            step={0.05}
                            value={pathParams.overlapRatio}
                            onChange={(value) => setPathParams({ ...pathParams, overlapRatio: value })}
                            marks={{ 0: '0%', 0.1: '10%', 0.2: '20%', 0.3: '30%' }}
                          />
                        </Form.Item>
                      </>
                    )
                  },
                  {
                    key: 'turn',
                    label: '转弯参数',
                    children: (
                      <>
                        <Form.Item label="最小转弯半径 (m)">
                          <InputNumber
                            min={0.3}
                            max={1.0}
                            step={0.1}
                            value={pathParams.minTurnRadius}
                            onChange={(value) => setPathParams({ ...pathParams, minTurnRadius: value || 0.5 })}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>

                        <Form.Item label="最大转弯半径 (m)">
                          <InputNumber
                            min={1.0}
                            max={5.0}
                            step={0.5}
                            value={pathParams.maxTurnRadius}
                            onChange={(value) => setPathParams({ ...pathParams, maxTurnRadius: value || 2.0 })}
                            style={{ width: '100%' }}
                          />
                        </Form.Item>

                        <Form.Item label="转弯方法">
                          <Select
                            value={pathParams.turnMethod}
                            onChange={(value) => setPathParams({ ...pathParams, turnMethod: value })}
                            style={{ width: '100%' }}
                          >
                            <Select.Option value="bezier">贝塞尔曲线</Select.Option>
                            <Select.Option value="arc">圆弧</Select.Option>
                            <Select.Option value="spline">样条曲线</Select.Option>
                          </Select>
                        </Form.Item>
                      </>
                    )
                  },
                  {
                    key: 'advanced',
                    label: '高级参数',
                    children: (
                      <>
                        <Form.Item label="中心线生成方法">
                          <Select
                            value={pathParams.centerlineMethod}
                            onChange={(value) => setPathParams({ ...pathParams, centerlineMethod: value })}
                            style={{ width: '100%' }}
                          >
                            <Select.Option value="distance_field">距离场法</Select.Option>
                            <Select.Option value="skeleton">骨架法</Select.Option>
                          </Select>
                        </Form.Item>
                      </>
                    )
                  }
                ]}
              />

              <Divider />

              <Space vertical style={{ width: '100%' }}>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleGeneratePath}
                  loading={generating}
                  block
                  size="large"
                >
                  生成路径
                </Button>

                <Button
                  icon={<SaveOutlined />}
                  onClick={handleSavePath}
                  loading={loading}
                  disabled={!generatedPath}
                  block
                >
                  保存路径
                </Button>

                <Button
                  icon={<DownloadOutlined />}
                  onClick={handleExportPath}
                  disabled={!generatedPath}
                  block
                >
                  导出YAML
                </Button>
              </Space>
            </Form>
          </Card>

          {renderPathInfo()}
          {renderTaskControl()}
        </Col>
      </Row>
    </div>
  );
};

export default PathAutoGenerator;
