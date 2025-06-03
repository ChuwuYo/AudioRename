// 主进程，负责处理窗口创建、文件对话框、元数据读取和文件重命名等核心逻辑。
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises; // 使用 fs.promises 以支持异步操作
const mm = require('music-metadata'); // 导入 music-metadata 库
const fastGlob = require('fast-glob'); // 导入 fast-glob 库

let mainWindow; // 声明 mainWindow 变量以供全局访问

/**
 * @function cleanFilename
 * @description 清理文件名，移除或替换非法字符，并根据提供的模式格式化文件名。
 * @param {string} artist - 艺术家名称。
 * @param {string} title - 歌曲标题。
 * @param {string} ext - 文件扩展名。
 * @param {string} pattern - 重命名模式 ('artist-title', 'title-artist', 'indexed-artist-title', 'indexed-title-artist')。
 * @param {number|null} index - 如果模式包含索引，则为文件的索引（1-based）。
 * @returns {string} 清理和格式化后的文件名。
 */
function cleanFilename(artist, title, ext, pattern, index = null) {
    let baseFilename;
    // 如果需要索引，将索引格式化为两位数字（例如 1 -> 01, 10 -> 10）
    const actualIndex = index !== null ? String(index).padStart(2, '0') : '';

    // 根据选择的模式构建基础文件名
    switch (pattern) {
        case 'title-artist':
            baseFilename = `${title} - ${artist}`;
            break;
        case 'indexed-artist-title':
            baseFilename = `${actualIndex}. ${artist} - ${title}`;
            break;
        case 'indexed-title-artist':
            baseFilename = `${actualIndex}. ${title} - ${artist}`;
            break;
        case 'artist-title':
        default:
            baseFilename = `${artist} - ${title}`;
            break;
    }

    let newFilename = `${baseFilename}${ext}`;
    // 定义文件名中不允许的非法字符正则表达式
    const illegalChars = /[\\/:*?"<>|]/g;
    // 替换非法字符为下划线
    newFilename = newFilename.replace(illegalChars, '_');
    // 移除文件名开头或结尾的空格和点
    newFilename = newFilename.replace(/^[. ]+|[. ]+$/g, '');

    // 如果清理后的文件名只剩下扩展名或为空，则使用备用名称
    if (newFilename === ext || newFilename.trim() === ext || newFilename.trim() === '') {
        const fallbackName = title || artist || 'UntitledTrack'; // 优先使用标题，其次艺术家，最后"UntitledTrack"
        newFilename = `${fallbackName}${ext}`.replace(illegalChars, '_').replace(/^[. ]+|[. ]+$/g, '');
        // 再次检查，如果仍然只剩下扩展名，则强制使用通用备用名
        if (newFilename === ext || newFilename.trim() === ext || newFilename.trim() === '') {
            newFilename = `UntitledTrack${ext}`;
        }
    }
    return newFilename;
}

/**
 * @function createMainWindow
 * @description 创建并加载应用的主窗口。
 */
const createMainWindow = () => {
    mainWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,    // 禁用直接在渲染进程中使用 Node.js API
            contextIsolation: true,    // 启用上下文隔离
            preload: path.join(__dirname, 'preload.js') // 配置预加载脚本
        },
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'assets', 'Music.ico')
    });

    mainWindow.loadFile('index.html');

    // mainWindow.webContents.openDevTools(); // 可取消注释以进行调试
};

// 当 Electron 应用准备就绪时创建主窗口
app.whenReady().then(createMainWindow);

// 监听所有窗口关闭事件
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 监听应用激活事件
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

/**
 * @async
 * @function findAudioFilesInDirectory
 * @description 使用 fast-glob 递归查找指定目录中的所有支持的音频文件。
 * @param {string} dirPath - 要搜索的目录路径。
 * @returns {Promise<string[]>} 音频文件路径的数组。
 */
async function findAudioFilesInDirectory(dirPath) {
    try {
        // 检查目录是否存在且可访问
        await fs.access(dirPath);
    } catch (error) {
        console.warn(`[Main Process] 目录未找到或无法访问: ${dirPath}`);
        return [];
    }

    // 定义支持的音频文件扩展名列表
    const audioExtensions = ['mp3', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'wv', 'opus', 'dsf', 'dff'];
    
    try {
        // 使用 fast-glob 进行快速文件搜索
        const files = await fastGlob(`**/*.{${audioExtensions.join(',')}}`, {
            cwd: dirPath,                    // 指定搜索目录
            absolute: true,                  // 返回绝对路径
            onlyFiles: true,                 // 只返回文件
            followSymbolicLinks: false,      // 不跟随符号链接
            ignore: ['**/node_modules/**'],  // 忽略 node_modules 目录        
            dot: false,                      // 不包含以 . 开头的文件
            unique: true                     // 确保结果唯一
        });

        return files;
    } catch (error) {
        console.error(`[Main Process] 搜索音频文件时出错:`, error);
        return [];
    }
}

/**
 * @listens ipcMain#select-directory
 * @description 处理从渲染进程发送的"选择目录"请求。当用户选择一个目录后，扫描其中的音频文件并返回给渲染进程。
 * @param {IpcMainEvent} event - IPC事件对象。
 */
ipcMain.on('select-directory', async (event) => {
    // 检查主窗口是否已初始化
    if (!mainWindow) {
        console.error('[Main Process] 主窗口 mainWindow 尚未初始化。');
        event.reply('operation-error', '主窗口未初始化，无法打开对话框。');
        event.reply('progress-update', { message: '操作错误。' });
        event.reply('selected-files-reply', []);
        return;
    }
    // 显示打开目录对话框
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    if (!canceled && filePaths.length > 0) {
        const selectedDirPath = filePaths[0];
        try {
            // 向渲染进程发送进度更新消息
            event.reply('progress-update', { message: '正在扫描目录中的音频文件...' });
            // 查找目录中的所有音频文件
            const files = await findAudioFilesInDirectory(selectedDirPath);
            // 再次发送进度更新消息，告知扫描结果
            event.reply('progress-update', { message: `扫描完成，找到 ${files.length} 个音频文件。` });
            // 将找到的文件路径回复给渲染进程
            event.reply('selected-files-reply', files);
        } catch (error) {
            // 处理读取目录时发生的错误
            console.error('[Main Process] 读取目录时出错:', error);
            event.reply('operation-error', '读取目录失败: ' + error.message);
            event.reply('progress-update', { message: '读取目录失败。' });
            event.reply('selected-files-reply', []);
        }
    } else {
        // 用户取消选择目录
        event.reply('progress-update', { message: '未选择目录。' });
        event.reply('selected-files-reply', []);
    }
});

/**
 * @listens ipcMain#select-files
 * @description 处理从渲染进程发送的"选择文件"请求。当用户选择文件后，将文件路径返回给渲染进程。
 * @param {IpcMainEvent} event - IPC事件对象。
 */
ipcMain.on('select-files', async (event) => {
    // 检查主窗口是否已初始化
    if (!mainWindow) {
        console.error('[Main Process] 主窗口 mainWindow 尚未初始化。');
        event.reply('operation-error', '主窗口未初始化，无法打开对话框。');
        event.reply('selected-files-reply', []);
        return;
    }
    // 显示打开文件对话框，允许选择多个音频文件
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: [
            { name: '音频文件', extensions: ['mp3', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'wv', 'opus', 'dsf', 'dff'] }
        ]
    });

    if (!canceled && filePaths.length > 0) {
        // 将选中的文件路径回复给渲染进程
        event.reply('selected-files-reply', filePaths);
    } else {
        // 用户取消选择文件
        event.reply('selected-files-reply', []);
    }
});

/**
 * @listens ipcMain#get-file-metadata
 * @description 处理从渲染进程发送的"获取文件元数据"请求。读取指定音频文件的艺术家和标题信息，并根据命名模式生成新的文件名。
 * @param {IpcMainEvent} event - IPC事件对象。
 * @param {object} payload - 包含 filePath (文件路径), pattern (命名模式), fileIndex (文件在列表中的索引), totalFiles (总文件数) 的对象。
 */
ipcMain.on('get-file-metadata', async (event, { filePath, pattern, fileIndex, totalFiles }) => {
    try {
        // 使用 music-metadata 库解析文件元数据,添加 skipCovers: true 避免读取封面图片
        const metadata = await mm.parseFile(filePath, { duration: false, skipCovers: true });
        // 获取艺术家和标题，如果不存在则使用默认值
        const artist = metadata.common.artist || '未知艺术家';
        const title = metadata.common.title || '未知标题';
        // 获取文件扩展名
        const ext = path.extname(filePath);
        // 根据命名模式和文件索引生成清理后的文件名
        const cleanedFileName = cleanFilename(artist, title, ext, pattern, pattern.startsWith('indexed-') ? fileIndex + 1 : null);

        // 将元数据结果回复给渲染进程
        event.reply('file-metadata-result', {
            filePath,          // 原始文件路径
            artist,            // 艺术家
            title,             // 标题
            cleanedFileName,   // 清理并格式化后的新文件名
            status: 'success', // 操作状态
            originalIndex: fileIndex // 文件原始索引，用于渲染进程排序
        });
    } catch (error) {
        // 处理获取元数据失败的情况
        console.error(`[Main Process] 获取文件 ${filePath} 的元数据失败:`, error);
        event.reply('file-metadata-result', {
            filePath: filePath,
            artist: '未知艺术家',
            title: '未知标题',
            cleanedFileName: path.basename(filePath), // 失败时使用原始文件名作为清理后的文件名
            status: 'error',
            message: `获取元数据失败: ${error.message}`, // 错误信息
            originalIndex: fileIndex
        });
    }
    // 每次处理发送一次IPC通信进度更新
    const progressBatchSize = 1;
    if (totalFiles > 0 && (fileIndex + 1) % progressBatchSize === 0 || (fileIndex + 1) === totalFiles) {
        event.reply('progress-update', {
            current: fileIndex + 1,
            total: totalFiles,
            message: '获取元数据中...'
        });
    }
});

/**
 * @listens ipcMain#rename-files
 * @description 处理从渲染进程发送的"重命名文件"请求。对每个文件执行重命名操作，并处理可能的文件名冲突。
 * @param {IpcMainEvent} event - IPC事件对象。
 * @param {object[]} filesToRename - 包含 oldPath (旧文件路径) 和 newFileName (新文件名) 的文件信息数组。
 */
ipcMain.on('rename-files', async (event, filesToRename) => {
    const results = []; // 存储重命名操作的结果
    const totalToRename = filesToRename.length;
    let processedCount = 0;

    // 遍历每个待重命名的文件
    for (const { oldPath, newFileName } of filesToRename) {
        processedCount++;
        // 更新渲染进程的进度
        event.reply('progress-update', {
            current: processedCount,
            total: totalToRename,
            message: '重命名文件中...'
        });

        const oldDir = path.dirname(oldPath); // 获取文件所在目录
        const newPathCandidate = path.join(oldDir, newFileName); // 构建新的完整路径
        let newPath = newPathCandidate; // 最终的新路径，可能因冲突而修改

        try {
            // 如果旧路径和新路径相同，则无需重命名
            if (oldPath === newPath) {
                results.push({
                    status: 'info',
                    oldPath: oldPath,
                    newPath: newPath,
                    message: `文件已是目标名称，无需重命名: ${path.basename(oldPath)}`
                });
                continue; // 跳过当前文件，处理下一个
            }

            let newPathExists = false; // 标记新路径是否存在
            let isSameFileDifferentCase = false; // 标记是否为大小写不同的同一文件

            // 尝试获取旧文件和新文件（如果存在）的状态，以检测冲突或大小写问题
            try {
                const oldStat = await fs.stat(oldPath);
                const newStatAttempt = await fs.stat(newPath);
                newPathExists = true;
                // 在某些文件系统（如Windows）上，文件名大小写不敏感，但重命名会改变大小写。
                // 检查 inode 和设备 ID 是否相同来判断是否是同一文件。
                if (oldStat.ino === newStatAttempt.ino && oldStat.dev === newStatAttempt.dev) {
                    isSameFileDifferentCase = true;
                }
            } catch (e) {
                // 如果文件不存在，fs.stat 会抛出 ENOENT 错误，这是预期行为，不需警告。
                if (e.code !== 'ENOENT') {
                    console.warn(`[Main Process] Stat error for ${newPath} or ${oldPath}: ${e.message}`);
                }
            }

            // 如果新路径已存在且不是同一文件（不同大小写），则处理文件名冲突
            if (newPathExists && !isSameFileDifferentCase) {
                newPath = await findAvailableNewPath(oldDir, newFileName);
                await fs.rename(oldPath, newPath);
                results.push({
                    status: 'success',
                    oldPath: oldPath,
                    newPath: newPath,
                    message: `成功: ${path.basename(oldPath)} -> ${path.basename(newPath)} (因同名文件已存在，已自动添加后缀)`
                });
            } else {
                // 如果新路径不存在，或者只是大小写不同，直接重命名
                await fs.rename(oldPath, newPath);
                results.push({
                    status: 'success',
                    oldPath: oldPath,
                    newPath: newPath,
                    message: `成功: ${path.basename(oldPath)} -> ${path.basename(newPath)}`
                });
            }
        } catch (error) {
            // 处理重命名失败的情况
            console.error(`[Main Process] 重命名文件 ${oldPath} 到 ${newFileName} 失败:`, error);
            results.push({
                status: 'error',
                oldPath: oldPath,
                newPath: null,
                message: `失败 ${path.basename(oldPath)}: ${error.message}`
            });
        }
    }
    // 所有重命名操作完成后，发送最终进度和结果
    event.reply('progress-update', { message: '所有重命名操作已处理完毕。' });
    event.reply('rename-results', results);
});

/**
 * @async
 * @function findAvailableNewPath
 * @description 查找一个可用的新文件路径，如果原始路径已存在，则尝试添加数字后缀。
 * @param {string} directory - 文件所在的目录。
 * @param {string} originalFileName - 原始文件名。
 * @returns {Promise<string>} 可用的新文件路径。
 */
async function findAvailableNewPath(directory, originalFileName) {
    let counter = 1;
    const baseName = path.basename(originalFileName, path.extname(originalFileName));
    const ext = path.extname(originalFileName);
    let newPath = path.join(directory, originalFileName);

    while (true) {
        try {
            await fs.access(newPath); // 检查文件是否存在
            // 如果文件存在，生成新的文件名
            if (counter > 100) { // 防止无限循环
                throw new Error("尝试了过多的后缀，无法生成唯一文件名。");
            }
            newPath = path.join(directory, `${baseName} (${counter})${ext}`);
            counter++;
        } catch (e) {
            if (e.code === 'ENOENT') {
                // 文件不存在，当前 newPath 可用
                return newPath;
            }
            throw e; // 其他错误则抛出
        }
    }
}