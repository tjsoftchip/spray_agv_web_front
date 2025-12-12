import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

const mockAxiosInstance = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  interceptors: {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  },
};

describe('API Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (axios.create as any) = vi.fn(() => mockAxiosInstance);
  });

  describe('authApi', () => {
    it('应该成功登录并返回token', async () => {
      const mockResponse = {
        data: {
          token: 'test-token',
          user: { id: 1, username: 'admin', role: 'admin' },
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const { authApi } = await import('../api');
      const result = await authApi.login('admin', 'password');
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('templateApi', () => {
    it('应该获取模板列表', async () => {
      const mockTemplates = [
        { id: '1', name: 'Template 1' },
        { id: '2', name: 'Template 2' },
      ];

      const mockResponse = { data: mockTemplates };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const { templateApi } = await import('../api');
      const result = await templateApi.getTemplates();
      expect(result).toEqual(mockTemplates);
    });

    it('应该创建新模板', async () => {
      const newTemplate = { name: 'New Template', description: 'Test' };
      const mockResponse = { data: { id: '3', ...newTemplate } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const { templateApi } = await import('../api');
      const result = await templateApi.createTemplate(newTemplate);
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('taskApi', () => {
    it('应该获取任务列表', async () => {
      const mockTasks = [
        { id: '1', name: 'Task 1', status: 'pending' },
        { id: '2', name: 'Task 2', status: 'running' },
      ];

      const mockResponse = { data: mockTasks };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const { taskApi } = await import('../api');
      const result = await taskApi.getTasks();
      expect(result).toEqual(mockTasks);
    });

    it('应该执行任务', async () => {
      const taskId = '1';
      const mockResponse = { data: { message: 'Task started' } };
      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const { taskApi } = await import('../api');
      const result = await taskApi.executeTask(taskId);
      expect(result).toEqual(mockResponse.data);
    });
  });
});
