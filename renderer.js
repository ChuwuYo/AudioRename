// 渲染进程，负责处理用户界面交互、向主进程发送请求以及展示结果。
const { ipcRenderer } = require('electron'); // 直接使用 ipcRenderer
const path = require('path'); // 直接使用 path 模块

const selectDirBtn = document.getElementById('select-dir-btn');
const selectFilesBtn = document.getElementById('select-files-btn');
const renameBtn = document.getElementById('rename-btn');
const fileListDiv = document.getElementById('fileList');
const logDiv = document.getElementById('log');
// 自定义下拉菜单的触发按钮，我们将监听其上的自定义事件
const renamePatternButton = document.getElementById('rename-pattern-button');
const loadingOverlay = document.getElementById('loading-overlay'); // 获取加载遮罩层
let loadingTimerId = null; // 用于存储 setTimeout 的 ID

let selectedFilePaths = [];
let filesWithMetadata = [];

/**
 * @function logMessage
 * @description 向日志区域添加消息。
 * @param {string} message - 要记录的消息内容。
 * @param {string} [type='info'] - 消息类型（'info', 'success', 'error', 'warning', 'progress'）。
 */
function logMessage(message, type = 'info') {
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
    } else { // 默认为 'info'
        iconSpan.textContent = 'ℹ️ ';
    }

    p.appendChild(iconSpan);
    p.appendChild(document.createTextNode(message));
    logDiv.appendChild(p);
    // 保持滚动条在底部
    logDiv.scrollTop = logDiv.scrollHeight;
}

/**
 * @function startLoadingIndicator
 * @description 启动一个定时器，如果在延迟后操作仍在进行，则显示加载遮罩。
 */
function startLoadingIndicator() {
    clearTimeout(loadingTimerId); // 清除任何现有定时器
    loadingTimerId = setTimeout(() => {
        if (loadingOverlay) {
            loadingOverlay.classList.add('visible');
        }
    }, 1000); // 1秒后显示
}

/**
 * @function stopLoadingIndicator
 * @description 隐藏加载遮罩并清除定时器。
 */
function stopLoadingIndicator() {
    clearTimeout(loadingTimerId);
    if (loadingOverlay) {
        loadingOverlay.classList.remove('visible');
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
                const errorMsg = fileData.message ? fileData.message.substring(0,50)+'...' : '未知错误';
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
    logMessage('应用程序初始化。', 'info');
    toggleControls(false); // 初始时启用所有控件
    renameBtn.disabled = true; // 重命名按钮初始禁用
    updateFileList(); // 更新文件列表显示
});

// 监听选择目录按钮点击事件
selectDirBtn.addEventListener('click', () => {
    logMessage('请求选择目录...');
    toggleControls(true); // 禁用控件，防止重复操作
    // 注意：这里不直接启动加载指示器，因为showOpenDialog可能很快完成
    ipcRenderer.send('select-directory'); // 向主进程发送请求
});

// 监听选择文件按钮点击事件
selectFilesBtn.addEventListener('click', () => {
    logMessage('请求选择文件...');
    toggleControls(true); // 禁用控件
    // 注意：这里不直接启动加载指示器，因为showOpenDialog可能很快完成
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
    startLoadingIndicator(); // 启动加载指示器，因为元数据重新获取是处理操作
    filesWithMetadata = []; // 清空已有的元数据，准备重新获取
    updateFileList(); // 更新文件列表显示为“等待元数据”状态

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
    startLoadingIndicator(); // 启动加载指示器，因为重命名是处理操作
    // 准备发送给主进程的重命名任务载荷
    const payload = filesToActuallyRename.map(f => ({
        oldPath: f.filePath,
        newFileName: f.cleanedFileName
    }));
    ipcRenderer.send('rename-files', payload); // 向主进程发送重命名请求
});

// 监听主进程回复的选定文件列表
ipcRenderer.on('selected-files-reply', (event, files) => {
    selectedFilePaths = files || []; // 更新选定的文件路径
    filesWithMetadata = []; // 清空之前的元数据

    if (selectedFilePaths.length > 0) {
        logMessage(`已选择 ${selectedFilePaths.length} 个文件。开始获取元数据...`);
        startLoadingIndicator(); // 在确认有文件需要处理（获取元数据）时启动加载指示器
        // 获取当前自定义下拉菜单中选中的模式
        const currentPattern = renamePatternButton.dataset.value;
        // 向主进程发送请求，获取每个文件的元数据
        selectedFilePaths.forEach((filePath, index) => {
            // 预先为每个文件添加一个“pending”状态的元数据占位符
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
        stopLoadingIndicator(); // 没有文件处理，停止加载指示器
        toggleControls(false); // 启用控件
    }
    updateFileList(); // 更新文件列表显示（此时会显示“等待元数据”状态）
});

// 监听主进程回复的文件元数据结果
ipcRenderer.on('file-metadata-result', (event, result) => {
    // 查找是否已存在该文件的元数据，如果存在则更新，否则添加
    // 使用 result.originalIndex 来确保正确更新对应文件的数据
    const existingIndex = filesWithMetadata.findIndex(f => f.originalIndex === result.originalIndex);
    if (existingIndex > -1) {
        filesWithMetadata[existingIndex] = result;
    } else {
        filesWithMetadata.push(result);
        // 如果文件未找到，可能是因为在处理过程中文件列表被清空或重新加载了
        // 这种情况下，确保 filesWithMetadata 仍然与 selectedFilePaths 同步
        filesWithMetadata.sort((a, b) => a.originalIndex - b.originalIndex);
    }

    if (result.status === 'error') {
        logMessage(`文件 "${path.basename(result.filePath)}" 元数据获取失败: ${result.message}`, 'error');
    }
    updateFileList(); // 实时更新文件列表显示

    // 如果所有文件的元数据都已获取，则重新启用控件
    if (filesWithMetadata.length === selectedFilePaths.length && selectedFilePaths.every((_, i) => filesWithMetadata.some(f => f.originalIndex === i))) {
        logMessage('所有文件的元数据信息已处理完毕。');
        toggleControls(false); // 启用控件
        stopLoadingIndicator(); // 停止加载指示器
    }
});

// 监听主进程回复的重命名结果
ipcRenderer.on('rename-results', (event, results) => {
    results.forEach(result => {
        logMessage(result.message, result.status); // 记录每个重命名操作的结果
    });
    logMessage('所有重命名操作已完成。', 'info');
    // 重命名完成后，清空文件列表和元数据
    selectedFilePaths = [];
    filesWithMetadata = [];
    updateFileList(); // 更新文件列表显示为占位符
    toggleControls(false); // 启用控件
    stopLoadingIndicator(); // 停止加载指示器
});

// 监听主进程发送的操作错误信息
ipcRenderer.on('operation-error', (event, message) => {
    logMessage(message, 'error');
    toggleControls(false); // 启用控件
    stopLoadingIndicator(); // 停止加载指示器
});

// 监听主进程发送的进度更新信息
ipcRenderer.on('progress-update', (event, data) => {
    let message = data.message;
    if (data.current !== undefined && data.total !== undefined) {
        message = `${data.message} (${data.current}/${data.total})`;
    }
    const lastLogEntry = logDiv.lastElementChild;
    // 如果上一条日志是进度信息，则更新它而不是添加新行
    // 仅当日志内容包含"..."时（表示进行中消息）才更新同一行，避免覆盖非进度消息
    if (lastLogEntry && lastLogEntry.textContent.includes('⏳') && lastLogEntry.textContent.includes('...')) {
        // 找到文本节点并更新其内容
        const textNode = Array.from(lastLogEntry.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
        if (textNode) {
             textNode.nodeValue = ` ${message}`; // 直接更新文本内容
        } else {
            // 备用方案：如果找不到文本节点，直接更新整个P标签的内容（可能覆盖图标）
            lastLogEntry.textContent = `⏳ ${message}`;
        }
    } else {
        // 否则，添加一条新的进度日志
        logMessage(message, 'progress');
    }
});