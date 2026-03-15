import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { networkInterfaces } from 'os'

// 自动检测后端服务地址
const getBackendTarget = () => {
  // 优先使用本地地址
  const targets = [
    'http://127.0.0.1:3000',    // IPv4 localhost
    'http://[::1]:3000',        // IPv6 localhost
    'http://localhost:3000',    // localhost
  ];
  
  // 添加局域网IP（如果有）
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        targets.push(`http://${net.address}:3000`);
      }
    }
  }
  
  return targets[0]; // 默认使用127.0.0.1
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: getBackendTarget(),
        changeOrigin: true,
        secure: false,
        timeout: 30000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy error:', err.message);
            // 如果连接失败，尝试备用地址
            if (err.message.includes('ECONNREFUSED')) {
              console.log('Backend not ready, retrying...');
            }
          });
          proxy.on('proxyReq', (_proxyReq, req, _res) => {
            console.log('Proxying:', req.method, req.url);
          });
        },
      },
      '/socket.io': {
        target: getBackendTarget(),
        changeOrigin: true,
        ws: true,
        secure: false,
        timeout: 30000,
      },
    },
  },
})
