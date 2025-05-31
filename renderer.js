// 渲染进程，负责处理用户界面交互、向主进程发送请求以及展示结果。
// 使用预加载脚本提供的安全 API，不再直接使用 require
const ipcRenderer = {
    send: (channel, data) => window.electronAPI.send(channel, data),
    on: (channel, callback) => window.electronAPI.receive(channel, callback)
};

// 使用预加载脚本提供的 pathUtils
const path = {
    basename: (filepath, ext) => window.pathUtils.basename(filepath, ext),
    extname: (filepath) => window.pathUtils.extname(filepath)
};

const selectDirBtn = document.getElementById('select-dir-btn');
const selectFilesBtn = document.getElementById('select-files-btn');
const renameBtn = document.getElementById('rename-btn');
const fileListDiv = document.getElementById('fileList');
const logDiv = document.getElementById('log');
// 自定义下拉菜单的触发按钮，我们将监听其上的自定义事件
const renamePatternButton = document.getElementById('rename-pattern-button');

let selectedFilePaths = [];
let filesWithMetadata = [];

// 标记是否已显示"所有文件处理完毕"的消息
let allFilesProcessedMessageShown = false;
// 当前正在处理的批次ID，用于区分不同的文件处理操作
let currentBatchId = 0;
// 添加一个变量来记录当前进度条的ID
let currentProgressElementId = null;

/**
 * @function clearLog
 * @description 清空日志区域，保留初始消息
 */
function clearLog() {
    // 保留第一条初始化消息
    const initialMessage = logDiv.firstChild;
    logDiv.innerHTML = '';
    if (initialMessage) {
        logDiv.appendChild(initialMessage);
    }
    // 重置进度条ID
    currentProgressElementId = null;
}

/**
 * @function logMessage
 * @description 向日志区域添加消息。
 * @param {string} message - 要记录的消息内容。
 * @param {string} [type='info'] - 消息类型（'info', 'success', 'error', 'warning', 'progress'）。
 * @param {number} [current=0] - 当前处理项，用于进度计算。
 * @param {number} [total=0] - 总项目数，用于进度计算。
 */
function logMessage(message, type = 'info', current = 0, total = 0) {
    // 检查是否已经存在相同的进度消息
    if (type === 'progress' && total > 0) {
        const existingProgress = document.getElementById(currentProgressElementId);
        if (existingProgress) {
            // 如果存在进度条，直接更新它
            if (updateProgressBar(current, total, message)) {
                return;
            }
        }
    }

    const p = document.createElement('p');
    // 设置 CSS 变量 --index 用于动画延迟
    p.style.setProperty('--index', logDiv.children.length);
    const iconSpan = document.createElement('span');
    iconSpan.classList.add('log-icon');

    // 根据消息类型设置文本颜色和图标
    if (type === 'success') {
        p.style.color = 'var(--md-sys-color-tertiary)';
        iconSpan.textContent = '✔️ ';
    } else if (type === 'error') {
        p.style.color = 'var(--md-sys-color-error)';
        iconSpan.textContent = '❌ ';
    } else if (type === 'warning') {
        p.style.color = '#FFA000'; // 警告色
        iconSpan.textContent = '⚠️ ';
    } else if (type === 'progress') {
        iconSpan.textContent = '⏳ ';
        
        // 如果是进度类型且有总数，添加进度条
        if (total > 0) {
            // 计算百分比，保留两位小数
            const percentage = Math.min(((current / total) * 100).toFixed(2), 100);
            
            // 创建进度条容器
            const progressContainer = document.createElement('div');
            progressContainer.classList.add('progress-container');
            
            // 创建进度条元素
            const progressBar = document.createElement('div');
            progressBar.classList.add('progress-bar');
            progressBar.style.width = `${percentage}%`;
            
            // 将进度条添加到容器
            progressContainer.appendChild(progressBar);
            
            // 将进度文本添加到消息后面
            const progressText = document.createElement('span');
            progressText.classList.add('progress-text');
            progressText.textContent = `${current}/${total} (${percentage}%)`;
            progressText.style.color = 'var(--md-sys-color-inverse-primary, #D0BCFF)';
            
            // 为进度条元素设置唯一ID
            const progressId = 'progress-' + Date.now();
            p.id = progressId;
            currentProgressElementId = progressId;
            
            // 将容器和进度信息添加到p元素
            p.appendChild(iconSpan);
            p.appendChild(document.createTextNode(message + ' '));
            p.appendChild(progressText);
            p.appendChild(progressContainer);
            
            // 如果已完成100%，更改图标
            if (parseFloat(percentage) >= 99.99) {
                iconSpan.textContent = '✓ ';
                iconSpan.style.color = 'var(--md-sys-color-tertiary)';
                // 更新消息为完成状态
                p.childNodes[1].nodeValue = ' 获取元数据完成 ';
            }
        }
    } else { // 默认为 'info'
        iconSpan.textContent = 'ℹ️ ';
    }

    if (type !== 'progress' || total === 0) {
        p.appendChild(iconSpan);
        p.appendChild(document.createTextNode(message));
    }

    // 限制日志条目数量，保留最新的1000条
    const MAX_LOG_ENTRIES = 1000;
    while (logDiv.children.length >= MAX_LOG_ENTRIES) {
        logDiv.removeChild(logDiv.firstChild);
    }

    // 如果是完成消息，确保它显示在进度条之后
    if (message === '所有文件的元数据信息已处理完毕。') {
        const progressElement = document.getElementById(currentProgressElementId);
        if (progressElement) {
            logDiv.insertBefore(p, progressElement.nextSibling);
        } else {
            logDiv.appendChild(p);
        }
    } else {
        logDiv.appendChild(p);
    }

    // 智能滚动：只有当用户没有手动滚动时才自动滚动到底部
    const isScrolledToBottom = logDiv.scrollHeight - logDiv.clientHeight <= logDiv.scrollTop + 1;
    if (isScrolledToBottom) {
        logDiv.scrollTop = logDiv.scrollHeight;
    }
}

/**
 * @function updateProgressBar
 * @description 更新现有进度条的进度
 * @param {number} current - 当前处理的项目
 * @param {number} total - 总项目数
 * @param {string} message - 进度消息
 */
function updateProgressBar(current, total, message) {
    // 计算百分比，确保不超过100%，保留两位小数
    const percentage = Math.min(((current / total) * 100).toFixed(2), 100);
    
    // 如果存在进度条元素ID，则更新该元素
    if (currentProgressElementId && document.getElementById(currentProgressElementId)) {
        const progressElement = document.getElementById(currentProgressElementId);
        const progressBar = progressElement.querySelector('.progress-bar');
        const progressText = progressElement.querySelector('.progress-text');
        const iconSpan = progressElement.querySelector('.log-icon');
        
        if (progressBar && progressText) {
            // 更新进度条宽度
            progressBar.style.width = `${percentage}%`;
            // 更新进度文本
            progressText.textContent = `${current}/${total} (${percentage}%)`;
            
            // 当进度到达100%时，更新图标为完成标志
            if (parseFloat(percentage) >= 99.99) {
                if (iconSpan) {
                    iconSpan.textContent = '✓ ';
                    iconSpan.style.color = 'var(--md-sys-color-tertiary)';
                }
                // 更新消息为完成状态
                const textNode = Array.from(progressElement.childNodes).find(node => 
                    node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
                if (textNode) {
                    textNode.nodeValue = ` 获取元数据完成 `;
                }
            } else {
                // 更新消息文本
                const textNode = Array.from(progressElement.childNodes).find(node => 
                    node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '');
                if (textNode) {
                    textNode.nodeValue = ` ${message} `;
                }
            }
            
            // 保持滚动条在底部
            logDiv.scrollTop = logDiv.scrollHeight;
            return true;
        }
    }
    return false;
}

/**
 * @function startProcessingIndicator
 * @description 显示处理指示器，创建或更新进度条
 * @param {string} message - 进度消息
 * @param {number} [current=0] - 当前处理项
 * @param {number} [total=0] - 总项目数
 */
function startProcessingIndicator(message, current = 0, total = 0) {
    if (total > 0) {
        // 尝试更新现有进度条，如果没有则创建新的
        if (!updateProgressBar(current, total, message)) {
            logMessage(message, 'progress', current, total);
        }
    } else {
        // 如果没有总数信息，则显示不确定进度的消息
        logMessage(message, 'progress');
    }
}

/**
 * @function updateProcessingIndicator
 * @description 更新处理进度
 * @param {string} message - 进度消息
 * @param {number} current - 当前处理项
 * @param {number} total - 总项目数
 */
function updateProcessingIndicator(message, current, total) {
    if (!updateProgressBar(current, total, message)) {
        logMessage(message, 'progress', current, total);
    }
}

/**
 * @function stopProcessingIndicator
 * @description 停止处理指示器，可选择显示完成消息
 * @param {string} [completeMessage] - 完成时显示的消息
 * @param {string} [type='success'] - 完成消息的类型
 */
function stopProcessingIndicator(completeMessage, type = 'success') {
    if (completeMessage) {
        logMessage(completeMessage, type);
    }
}

/**
 * @function updateFileList
 * @description 更新文件列表的显示区域，根据文件元数据和重命名状态显示信息。
 */
function updateFileList() {
    fileListDiv.innerHTML = ''; // 清空现有列表

    // 如果没有文件，显示占位符信息
    if (selectedFilePaths.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.classList.add('file-item-placeholder');

        const line1 = document.createElement('p');
        line1.textContent = '未选择文件或目录';
        placeholder.appendChild(line1);

        const line2 = document.createElement('p');
        line2.textContent = '支持的格式(要有元数据标签): ';
        placeholder.appendChild(line2);

        // 显示支持的音频格式
        const formats = ['mp3', 'flac', 'ogg', 'm4a', 'aac', 'wma', 'wv', 'opus'];
        formats.forEach((format, index) => {
            const codeSpan = document.createElement('code');
            codeSpan.textContent = format;
            line2.appendChild(codeSpan);
            if (index < formats.length - 1) {
                line2.appendChild(document.createTextNode(', '));
            }
        });

        fileListDiv.appendChild(placeholder);
        renameBtn.disabled = true; // 没有文件时禁用重命名按钮
        return;
    }

    // 根据原始索引对文件元数据进行排序，以保持文件列表顺序与选择顺序一致
    // 注意：这里创建了一个副本进行排序，避免修改原始filesWithMetadata数组的顺序
    const sortedFilesWithMetadata = [...filesWithMetadata].sort((a, b) => a.originalIndex - b.originalIndex);

    // 遍历所有选中的文件路径，创建文件项
    selectedFilePaths.forEach((filePath, index) => {
        // 尝试从 sortedFilesWithMetadata 中找到当前文件的元数据，确保与原始索引匹配
        const fileData = sortedFilesWithMetadata.find(f => f.originalIndex === index);
        const div = document.createElement('div');
        div.classList.add('file-item');

        const icon = document.createElement('span');
        icon.classList.add('icon');
        icon.setAttribute('aria-hidden', 'true');

        const textSpan = document.createElement('span');
        textSpan.classList.add('file-name-text');
        let currentFileName = path.basename(filePath); // 原始文件名

        if (fileData) {
            if (fileData.status === 'success') {
                icon.textContent = '🎵 ';
                div.classList.remove('pending', 'error'); // 移除待处理和错误样式
                div.style.borderColor = 'var(--md-sys-color-outline-variant)'; // 默认边框
                // 如果元数据获取成功，显示旧文件名 -> 新文件名
                textSpan.textContent = `${currentFileName} → ${fileData.cleanedFileName}`;
                if (currentFileName === fileData.cleanedFileName) {
                    textSpan.textContent += " (名称符合标准)";
                    div.style.borderColor = 'var(--md-sys-color-tertiary)'; // 名称符合标准时显示特殊边框
                }
            } else if (fileData.status === 'error') {
                icon.textContent = '❌ '; // 错误图标
                div.classList.add('error'); // 添加错误样式类
                div.classList.remove('pending'); // 移除待处理样式
                // 如果元数据获取失败，显示错误信息
                const errorMsg = fileData.message ? fileData.message.substring(0, 50) + '...' : '未知错误';
                textSpan.textContent = `${currentFileName} (元数据读取失败: ${errorMsg})`;
                div.style.borderColor = 'var(--md-sys-color-error)'; // 错误时显示错误边框
            } else {
                icon.textContent = '⏳ '; // 正在等待图标
                // 未知状态或正在等待元数据
                textSpan.textContent = currentFileName + " (等待元数据...)";
                div.classList.add('pending'); // 添加待处理样式类
                div.classList.remove('error'); // 移除错误样式
            }
        } else {
            icon.textContent = '⏳ '; // 正在等待图标
            // 文件还在等待元数据处理
            textSpan.textContent = currentFileName + " (等待元数据...)";
            div.classList.add('pending'); // 添加待处理样式类
            div.classList.remove('error'); // 移除错误样式
        }
        div.appendChild(icon);
        div.appendChild(textSpan);
        fileListDiv.appendChild(div);
    });

    // 只有当所有文件的元数据都已处理，并且有文件被选中时，才启用重命名按钮
    const allMetadataProcessed = filesWithMetadata.length === selectedFilePaths.length;
    renameBtn.disabled = !allMetadataProcessed || selectedFilePaths.length === 0;

    // 进一步判断：只有当有实际需要重命名的文件时才启用重命名按钮
    if (!renameBtn.disabled) {
        const hasFilesToRename = filesWithMetadata.some(f => f.status === 'success' && path.basename(f.filePath) !== f.cleanedFileName);
        renameBtn.disabled = !hasFilesToRename;
    }
}

/**
 * @function toggleControls
 * @description 切换界面上控件的禁用状态。
 * @param {boolean} disabled - true 表示禁用控件，false 表示启用。
 */
function toggleControls(disabled) {
    selectDirBtn.disabled = disabled;
    selectFilesBtn.disabled = disabled;
    renamePatternButton.disabled = disabled; // 禁用自定义下拉菜单的触发按钮

    if (disabled) {
        renameBtn.disabled = true; // 如果整体禁用，则重命名按钮也禁用
    } else {
        // 否则，根据文件状态判断是否启用重命名按钮
        const canRename = selectedFilePaths.length > 0 &&
            filesWithMetadata.length === selectedFilePaths.length &&
            filesWithMetadata.some(f => f.status === 'success' && path.basename(f.filePath) !== f.cleanedFileName);
        renameBtn.disabled = !canRename;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 添加进度条样式
    const style = document.createElement('style');
    style.textContent = `
        .progress-container {
            width: 100%;
            height: 4px;
            background-color: var(--md-sys-color-surface-variant);
            border-radius: 2px;
            margin-top: 4px;
            overflow: hidden;
        }
        
        .progress-bar {
            height: 100%;
            background-color: var(--md-sys-color-primary);
            border-radius: 2px;
            transition: width 0.3s ease;
        }
        
        .progress-text {
            margin-left: 4px;
            font-size: 0.85em;
            color: var(--md-sys-color-primary);
            font-weight: 600;
        }
        
        /* 对于黑色背景的日志条目 */
        #log p .progress-text {
            color: var(--md-sys-color-inverse-primary, #D0BCFF);
        }

        /* 清理日志按钮样式 */
        #clear-log-btn {
            position: absolute;
            top: 8px;
            right: 8px;
            min-width: 28px;
            min-height: 28px;
            padding: 0 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0;
            z-index: 2;
        }
        #clear-log-btn svg {
            width: 18px;
            height: 18px;
            display: block;
        }
        #clear-log-btn .icon-stroke {
            stroke: #fff;
        }
    `;
    document.head.appendChild(style);
    
    // 添加清理日志按钮（SVG图标）
    const clearLogBtn = document.createElement('button');
    clearLogBtn.id = 'clear-log-btn';
    clearLogBtn.title = '清理日志';
    clearLogBtn.type = 'button';
    clearLogBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none">
            <rect x="2" y="7" width="20" height="13" rx="3" fill="none"/>
            <path class="icon-stroke" d="M8 11v5M12 11v5M16 11v5M4 7h16M10 3h4a2 2 0 0 1 2 2v2H8V5a2 2 0 0 1 2-2z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
    clearLogBtn.addEventListener('click', clearLog);
    logDiv.parentElement.style.position = 'relative';
    logDiv.parentElement.appendChild(clearLogBtn);
    
    logMessage('应用程序初始化。', 'info');
    toggleControls(false); // 初始时启用所有控件
    renameBtn.disabled = true; // 重命名按钮初始禁用
    updateFileList(); // 更新文件列表显示
});

// 监听选择目录按钮点击事件
selectDirBtn.addEventListener('click', () => {
    logMessage('请求选择目录...');
    toggleControls(true); // 禁用控件，防止重复操作
    
    // 增加批次ID以区分新的操作
    currentBatchId++;
    // 重置状态变量
    allFilesProcessedMessageShown = false;
    
    ipcRenderer.send('select-directory'); // 向主进程发送请求
});

// 监听选择文件按钮点击事件
selectFilesBtn.addEventListener('click', () => {
    logMessage('请求选择文件...');
    toggleControls(true); // 禁用控件
    
    // 增加批次ID以区分新的操作
    currentBatchId++;
    // 重置状态变量
    allFilesProcessedMessageShown = false;
    
    ipcRenderer.send('select-files'); // 向主进程发送请求
});

// 监听自定义下拉菜单的命名模式改变事件
renamePatternButton.addEventListener('rename-pattern-change', (event) => {
    // 从自定义事件的 detail 中获取新的命名模式值
    const newPattern = event.detail.value;
    const newPatternText = event.detail.text;

    if (selectedFilePaths.length === 0) {
        logMessage(`命名模式已更改为 "${newPatternText}"，但未选择文件。`, 'info');
        return;
    }

    logMessage(`命名模式已更改为 "${newPatternText}"，重新获取元数据...`, 'info');
    toggleControls(true); // 禁用控件
    startProcessingIndicator('准备获取元数据...', 0, selectedFilePaths.length); // 使用新的处理指示器
    filesWithMetadata = []; // 清空已有的元数据，准备重新获取
    
    // 增加批次ID以区分新的操作
    currentBatchId++;
    // 重置状态变量
    allFilesProcessedMessageShown = false;
    
    updateFileList(); // 更新文件列表显示为"等待元数据"状态

    // 重新向主进程发送请求，获取所有选中文件的元数据
    selectedFilePaths.forEach((filePath, index) => {
        ipcRenderer.send('get-file-metadata', {
            filePath,
            pattern: newPattern, // 使用新的命名模式
            fileIndex: index,
            totalFiles: selectedFilePaths.length
        });
    });
});

// 监听开始重命名按钮点击事件
renameBtn.addEventListener('click', () => {
    // 再次检查文件和元数据状态
    if (filesWithMetadata.length === 0 || filesWithMetadata.length !== selectedFilePaths.length) {
        logMessage('元数据尚未完全加载，或没有文件可供重命名。', 'warning');
        return;
    }
    // 过滤出需要实际重命名的文件（状态成功且新旧文件名不同）
    const filesToActuallyRename = filesWithMetadata.filter(f => f.status === 'success' && path.basename(f.filePath) !== f.cleanedFileName);
    if (filesToActuallyRename.length === 0) {
        logMessage('没有需要重命名的文件。', 'warning');
        toggleControls(false); // 重新启用控件
        return;
    }
    logMessage(`准备重命名 ${filesToActuallyRename.length} 个文件...`, 'info');
    toggleControls(true); // 禁用控件
    startProcessingIndicator('开始重命名文件...', 0, filesToActuallyRename.length); // 使用新的处理指示器
    
    // 增加批次ID以区分新的操作
    currentBatchId++;
    // 重置状态变量
    allFilesProcessedMessageShown = false;
    
    // 准备发送给主进程的重命名任务载荷
    const payload = filesToActuallyRename.map(f => ({
        oldPath: f.filePath,
        newFileName: f.cleanedFileName
    }));
    ipcRenderer.send('rename-files', payload); // 向主进程发送重命名请求
});

// 监听主进程回复的选定文件列表
ipcRenderer.on('selected-files-reply', (files) => {
    selectedFilePaths = files || []; // 更新选定的文件路径
    filesWithMetadata = []; // 清空之前的元数据
    
    // 重置状态变量
    allFilesProcessedMessageShown = false;
    
    if (selectedFilePaths.length > 0) {
        logMessage(`已选择 ${selectedFilePaths.length} 个文件。开始获取元数据...`);
        startProcessingIndicator('准备获取元数据...', 0, selectedFilePaths.length); // 使用新的处理指示器
        // 获取当前自定义下拉菜单中选中的模式
        const currentPattern = renamePatternButton.dataset.value;
        // 向主进程发送请求，获取每个文件的元数据
        selectedFilePaths.forEach((filePath, index) => {
            // 预先为每个文件添加一个"pending"状态的元数据占位符
            filesWithMetadata.push({
                filePath: filePath,
                status: 'pending',
                originalIndex: index // 确保索引正确
            });
            ipcRenderer.send('get-file-metadata', {
                filePath,
                pattern: currentPattern,
                fileIndex: index,
                totalFiles: selectedFilePaths.length
            });
        });
        // 控件会保持禁用直到所有元数据获取完成
        renameBtn.disabled = true; // 初始禁用重命名按钮
    } else {
        logMessage('没有选择任何文件或所选目录为空。');
        stopProcessingIndicator(); // 停止处理指示器
        toggleControls(false); // 启用控件
    }
    updateFileList(); // 更新文件列表显示（此时会显示"等待元数据"状态）
});

// 监听主进程回复的文件元数据结果
ipcRenderer.on('file-metadata-result', (result) => {
    // 查找是否已存在该文件的元数据，如果存在则更新，否则添加
    const existingIndex = filesWithMetadata.findIndex(f => f.originalIndex === result.originalIndex);
    if (existingIndex > -1) {
        filesWithMetadata[existingIndex] = result;
    } else {
        filesWithMetadata.push(result);
        filesWithMetadata.sort((a, b) => a.originalIndex - b.originalIndex);
    }

    if (result.status === 'error') {
        logMessage(`文件 "${path.basename(result.filePath)}" 元数据获取失败: ${result.message}`, 'error');
    }
    updateFileList();

    // 更新进度
    if (selectedFilePaths.length > 0) {
        const processedCount = filesWithMetadata.length;
        // 确保进度条显示100%
        if (processedCount === selectedFilePaths.length) {
            updateProcessingIndicator('获取元数据完成', selectedFilePaths.length, selectedFilePaths.length);
        } else {
            updateProcessingIndicator('获取元数据中...', processedCount, selectedFilePaths.length);
        }
    }

    // 如果所有文件的元数据都已获取，则重新启用控件
    if (filesWithMetadata.length === selectedFilePaths.length && 
        selectedFilePaths.every((_, i) => filesWithMetadata.some(f => f.originalIndex === i))) {
        
        // 确保显示100%的进度
        updateProcessingIndicator('获取元数据完成', selectedFilePaths.length, selectedFilePaths.length);
        
        // 延迟显示完成消息，确保它在进度消息之后显示
        setTimeout(() => {
            if (!allFilesProcessedMessageShown) {
                stopProcessingIndicator('所有文件的元数据信息已处理完毕。', 'info');
                allFilesProcessedMessageShown = true;
            }
            toggleControls(false);
        }, 100);
    }
});

// 监听主进程回复的重命名结果
ipcRenderer.on('rename-results', (results) => {
    results.forEach(result => {
        logMessage(result.message, result.status); // 记录每个重命名操作的结果
    });
    stopProcessingIndicator('所有重命名操作已完成。', 'info'); // 使用新的处理指示器停止函数
    // 重命名完成后，清空文件列表和元数据
    selectedFilePaths = [];
    filesWithMetadata = [];
    updateFileList(); // 更新文件列表显示为占位符
    toggleControls(false); // 启用控件
});

// 监听主进程发送的操作错误信息
ipcRenderer.on('operation-error', (message) => {
    logMessage(message, 'error');
    stopProcessingIndicator(); // 停止处理指示器
    toggleControls(false); // 启用控件
});

// 添加进度更新监听器
ipcRenderer.on('progress-update', (data) => {
    // 确认有当前和总数信息
    if (data.current === undefined || data.total === undefined) {
        // 如果没有进度信息，直接显示消息
        logMessage(data.message, 'progress');
        return;
    }
    
    // 直接更新进度条，不再使用消息队列
    updateProcessingIndicator(data.message, data.current, data.total);
});

/**
 * @function processQueuedProgressMessages
 * @description 处理队列中的进度消息，确保按顺序显示
 * @param {boolean} [forceAll=false] - 是否强制处理所有消息，忽略顺序
 */
function processQueuedProgressMessages(forceAll = false) {
    // 简化为只处理强制更新到100%的情况
    if (forceAll && selectedFilePaths.length > 0) {
        updateProcessingIndicator('获取元数据完成', selectedFilePaths.length, selectedFilePaths.length);
    }
    // 清空消息队列
    pendingProgressMessages = [];
}