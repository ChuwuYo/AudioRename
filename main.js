// 主进程，负责处理窗口创建、文件对话框、元数据读取和文件重命名等核心逻辑。
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const mm = require('music-metadata'); // 导入 music-metadata 库

// 辅助函数：清理文件名，移除或替换非法字符。
function cleanFilename(artist, title, ext) {
    let newFilename = `${artist} - ${title}${ext}`;
    // 定义Windows和macOS文件名中的非法字符
    const illegalChars = /[\\/:*?"<>|]/g;
    newFilename = newFilename.replace(illegalChars, '_');
    // 移除文件名开头和结尾的空格以及点
    newFilename = newFilename.replace(/^[. ]+|[. ]+$/g, '');
    return newFilename;
}

// 创建主应用窗口。
const createMainWindow = () => {
    const win = new BrowserWindow({
        width: 1000,
        height: 750, // 稍微增加高度以容纳更多日志
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: true, // 允许在渲染进程中使用 Node.js API
            contextIsolation: false, // preload脚本和渲染进程共享同一个全局window对象
            // preload: path.join(__dirname, 'preload.js') // 如果使用 contextIsolation: true, 则需要preload脚本
        },
        autoHideMenuBar: true // 自动隐藏菜单栏
    });

    win.loadFile('index.html');

    // win.webContents.openDevTools(); // 打开开发者工具，方便调试
};

// Electron应用就绪后创建主窗口。
app.whenReady().then(createMainWindow);

// 当所有窗口关闭时退出应用，macOS除外。
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 当应用被激活时（例如点击Dock图标），如果没有窗口则创建主窗口。
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

// 递归查找指定目录中的所有支持的音频文件。
function findAudioFilesInDirectory(dirPath) {
    let audioFiles = [];
    if (!fs.existsSync(dirPath)) {
        console.warn(`目录未找到: ${dirPath}`);
        return [];
    }

    const files = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
            audioFiles = audioFiles.concat(findAudioFilesInDirectory(fullPath));
        } else if (file.isFile()) {
            const ext = path.extname(file.name).toLowerCase();
            const audioExtensions = ['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.wv', '.aiff', '.aif', '.opus'];
            if (audioExtensions.includes(ext)) {
                audioFiles.push(fullPath);
            }
        }
    }
    return audioFiles;
}

// 处理从渲染进程发送的“选择目录”请求。
ipcMain.on('select-directory', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });

    if (!canceled && filePaths.length > 0) {
        const selectedDirPath = filePaths[0];
        try {
            const files = findAudioFilesInDirectory(selectedDirPath);
            event.reply('selected-files-reply', files); // 修改了回复通道名称以更清晰
        } catch (error) {
            console.error('读取目录时出错:', error);
            event.reply('operation-error', '读取目录失败: ' + error.message);
        }
    }
});

// 处理从渲染进程发送的“选择文件”请求。
ipcMain.on('select-files', async (event) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: '音频文件', extensions: ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac', 'wma', 'wv', 'aiff', 'aif', 'opus'] }
        ]
    });

    if (!canceled && filePaths.length > 0) {
        event.reply('selected-files-reply', filePaths); // 和选择目录使用相同的回复通道
    }
});

// 处理从渲染进程发送的“获取文件元数据”请求。
ipcMain.on('get-file-metadata', async (event, filePath) => {
    try {
        const metadata = await mm.parseFile(filePath, { duration: false });
        const artist = metadata.common.artist || '未知艺术家';
        const title = metadata.common.title || '未知标题';
        const ext = path.extname(filePath);
        const cleanedFileName = cleanFilename(artist, title, ext);

        event.reply('file-metadata-result', {
            filePath,
            artist,
            title,
            cleanedFileName,
            status: 'success'
        });
    } catch (error) {
        console.error(`获取文件 ${filePath} 的元数据失败:`, error);
        event.reply('file-metadata-result', {
            filePath: filePath,
            artist: '未知艺术家',
            title: '未知标题',
            cleanedFileName: path.basename(filePath),
            status: 'error',
            message: `获取元数据失败: ${error.message}`
        });
    }
});

// 处理从渲染进程发送的“重命名文件”请求。
ipcMain.on('rename-files', async (event, filesToRename) => { // filesToRename 是一个对象数组 [{oldPath, newFileName}]
    const results = [];
    for (const { oldPath, newFileName } of filesToRename) {
        const oldDir = path.dirname(oldPath);
        const newPath = path.join(oldDir, newFileName);
        try {
            if (oldPath === newPath) {
                 results.push({
                    status: 'info',
                    oldPath: oldPath,
                    newPath: newPath,
                    message: `文件已是目标名称，无需重命名: ${path.basename(oldPath)}`
                });
            } else if (fs.existsSync(newPath)) {
                // 如果新文件名已存在，且不是指向旧文件本身（大小写不同的情况），则添加后缀
                let finalNewPath = newPath;
                let counter = 1;
                const baseName = path.basename(newFileName, path.extname(newFileName));
                const ext = path.extname(newFileName);
                while (fs.existsSync(finalNewPath)) {
                    finalNewPath = path.join(oldDir, `${baseName} (${counter})${ext}`);
                    counter++;
                    if (counter > 100) { // 防止无限循环
                        throw new Error("尝试了过多的后缀，无法生成唯一文件名。");
                    }
                }
                fs.renameSync(oldPath, finalNewPath);
                results.push({
                    status: 'success',
                    oldPath: oldPath,
                    newPath: finalNewPath,
                    message: `成功: ${path.basename(oldPath)} -> ${path.basename(finalNewPath)} (因同名文件已存在，已自动添加后缀)`
                });
            } else {
                fs.renameSync(oldPath, newPath);
                results.push({
                    status: 'success',
                    oldPath: oldPath,
                    newPath: newPath,
                    message: `成功: ${path.basename(oldPath)} -> ${path.basename(newPath)}`
                });
            }
        } catch (error) {
            console.error(`重命名文件 ${oldPath} 失败:`, error);
            results.push({
                status: 'error',
                oldPath: oldPath,
                newPath: null, // 重命名失败，没有新路径
                message: `失败 ${path.basename(oldPath)}: ${error.message}`
            });
        }
    }
    event.reply('rename-results', results);
});