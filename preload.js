/**
 * @file preload.js
 * @description 预加载脚本，用于在渲染进程中安全地暴露 IPC 通信和文件路径处理功能
 */
const { contextBridge, ipcRenderer } = require('electron');

// 创建安全的 IPC 通信接口
contextBridge.exposeInMainWorld('electronAPI', {
    // 向主进程发送消息的方法
    send: (channel, data) => {
        // 定义允许的通信通道
        const validChannels = [
            'select-directory',
            'select-files',
            'get-file-metadata',
            'rename-files'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    
    // 从主进程接收消息的方法
    receive: (channel, func) => {
        // 定义允许的接收通道
        const validChannels = [
            'selected-files-reply',
            'file-metadata-result',
            'rename-results',
            'operation-error',
            'progress-update'
        ];
        if (validChannels.includes(channel)) {
            // 使用闭包保存原始函数
            const subscription = (event, ...args) => func(...args);
            ipcRenderer.on(channel, subscription);
            
            // 返回取消订阅的函数
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        }
    }
});

// 安全地暴露文件路径处理功能（不暴露完整的 path 模块）
contextBridge.exposeInMainWorld('pathUtils', {
    // 仅提供必要的文件路径处理函数
    basename: (filepath, ext) => {
        // 简单实现 basename 功能
        let base = filepath.split(/[\\/]/).pop();
        if (ext && base.endsWith(ext)) {
            base = base.slice(0, -ext.length);
        }
        return base;
    },
    
    // 获取文件扩展名
    extname: (filepath) => {
        // 简单实现 extname 功能
        const match = filepath.match(/\.[^.\\/:*?"<>|\r\n]+$/);
        return match ? match[0] : '';
    }
}); 