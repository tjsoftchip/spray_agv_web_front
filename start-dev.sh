#!/bin/bash
# 自动获取本机 IP 并启动前端开发服务器

# 获取本机 WiFi 网卡的 IP 地址
LOCAL_IP=$(ip addr show | grep "inet " | grep -v "127.0.0.1" | grep -v "docker" | awk '{print $2}' | cut -d'/' -f1 | head -1)

if [ -z "$LOCAL_IP" ]; then
    echo "Error: Could not determine local IP address"
    exit 1
fi

echo "Local IP: $LOCAL_IP"

# 导出环境变量
export VITE_WS_URL="http://${LOCAL_IP}:3000"

echo "Starting frontend with VITE_WS_URL=$VITE_WS_URL"

# 启动 Vite 开发服务器
npm run dev