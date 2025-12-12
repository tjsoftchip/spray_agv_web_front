# 梁场养护机器人 - Web前端

基于React + TypeScript + Vite + Ant Design的Web前端应用。

## 技术栈

- **框架**: React 18.x
- **语言**: TypeScript 5.x
- **构建工具**: Vite 4.x
- **UI组件库**: Ant Design 5.x
- **状态管理**: Redux Toolkit
- **路由**: React Router 6.x
- **实时通信**: Socket.IO Client
- **HTTP客户端**: Axios

## 项目结构

```
frontend/
├── src/
│   ├── components/      # 公共组件
│   ├── pages/           # 页面组件
│   ├── store/           # Redux状态管理
│   ├── services/        # API服务
│   ├── hooks/           # 自定义Hooks
│   ├── utils/           # 工具函数
│   ├── types/           # TypeScript类型定义
│   ├── App.tsx          # 应用根组件
│   └── main.tsx         # 应用入口
├── public/              # 静态资源
├── .env                 # 环境变量
└── package.json         # 项目配置
```

## 安装依赖

```bash
npm install
```

## 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

## 构建生产版本

```bash
npm run build
```

## 预览生产构建

```bash
npm run preview
```

## 功能模块

### 已实现

- ✅ 用户登录/登出
- ✅ 系统概览仪表盘
- ✅ 响应式布局
- ✅ WebSocket实时通信
- ✅ Redux状态管理

### 待实现

- ⏳ 模板管理
- ⏳ 任务管理
- ⏳ 设备控制
- ⏳ 补给管理
- ⏳ 系统设置

## 默认登录账号

- 用户名: `admin`
- 密码: `admin123`

## 环境变量

```
VITE_API_BASE_URL=http://localhost:3000/api
VITE_WS_URL=http://localhost:3000
```

## 注意事项

1. 确保后端服务已启动
2. 确保ROS2 rosbridge服务已启动
3. 开发环境使用热更新，修改代码后自动刷新