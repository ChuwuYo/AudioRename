// 渲染进程，负责处理用户界面交互、向主进程发送请求以及展示结果。
const { ipcRenderer } = require('electron');
const path = require('path'); // <--- 修正：导入 path 模块

const selectDirBtn = document.getElementById('select-dir-btn');
const selectFilesBtn = document.getElementById('select-files-btn');
const renameBtn = document.getElementById('rename-btn');
const fileListDiv = document.getElementById('fileList');
const logDiv = document.getElementById('log');

let selectedFilePaths = []; // 存储当前选择的文件路径
let filesWithMetadata = []; // 存储包含元数据和建议新名称的文件信息

// 向日志区域添加消息。
function logMessage(message, type = 'info') {
    const p = document.createElement('p');
    p.style.setProperty('--index', logDiv.children.length); // 用于动画延迟

    const iconSpan = document.createElement('span');
    iconSpan.classList.add('log-icon');

    if (type === 'success') {
        p.style.color = 'var(--md-sys-color-tertiary)';
        iconSpan.textContent = '✔️ ';
    } else if (type === 'error') {
        p.style.color = 'var(--md-sys-color-error)';
        iconSpan.textContent = '❌ ';
    } else if (type === 'warning') {
        p.style.color = '#FFA000';
        iconSpan.textContent = '⚠️ ';
    } else { // info
        iconSpan.textContent = 'ℹ️ ';
    }
    p.appendChild(iconSpan);
    p.appendChild(document.createTextNode(message));
    logDiv.appendChild(p);
    logDiv.scrollTop = logDiv.scrollHeight;
}

// 更新文件列表的显示。
function updateFileList() {
    fileListDiv.innerHTML = ''; // 清空现有列表
    if (selectedFilePaths.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.classList.add('file-item-placeholder');
        placeholder.textContent = '未选择文件或目录。支持的格式: mp3, flac, wav, ogg, m4a, aac, wma, wv, aiff, aif, opus';
        fileListDiv.appendChild(placeholder);
        renameBtn.disabled = true;
    } else {
        selectedFilePaths.forEach((filePath) => {
            const fileData = filesWithMetadata.find(f => f.filePath === filePath);
            const div = document.createElement('div');
            div.classList.add('file-item');
            
            const icon = document.createElement('span');
            icon.classList.add('icon');
            icon.setAttribute('aria-hidden', 'true');
            icon.textContent = '🎵 ';
            div.appendChild(icon);

            const textSpan = document.createElement('span');
            textSpan.classList.add('file-name-text');

            // 即使元数据还未加载完成，也先显示原始文件名
            let currentFileName = path.basename(filePath); // 确保能访问 path.basename

            if (fileData) { // 如果已有元数据信息
                if (fileData.status === 'success') {
                    textSpan.textContent = `${currentFileName} → ${fileData.cleanedFileName}`;
                    if (currentFileName === fileData.cleanedFileName) {
                        textSpan.textContent += " (名称符合标准)";
                        div.style.borderColor = 'var(--md-sys-color-tertiary)';
                    }
                } else if (fileData.status === 'error') {
                    textSpan.textContent = `${currentFileName} (元数据读取失败)`;
                    div.style.borderColor = 'var(--md-sys-color-error)';
                } else {
                     textSpan.textContent = currentFileName; // 正在加载元数据的状态（理论上不应出现）
                }
            } else { // 元数据尚未加载
                textSpan.textContent = currentFileName;
            }
            div.appendChild(textSpan);
            fileListDiv.appendChild(div);
        });
        // 只有在所有元数据都获取完毕（无论成功或失败）后才启用重命名按钮
        renameBtn.disabled = filesWithMetadata.length !== selectedFilePaths.length || selectedFilePaths.length === 0;
    }
}

// 切换按钮的禁用状态。
function toggleControls(disabled) {
    selectDirBtn.disabled = disabled;
    selectFilesBtn.disabled = disabled;
    // 重命名按钮的禁用状态由 updateFileList 和 selected-files-reply 中的逻辑控制
    if (disabled) { // 如果是要禁用所有，renameBtn也一并禁用
        renameBtn.disabled = true;
    } else if (selectedFilePaths.length > 0 && filesWithMetadata.length === selectedFilePaths.length) {
        // 如果是要启用，并且条件满足，则启用renameBtn
        renameBtn.disabled = false;
    } else {
        // 否则，保持renameBtn禁用（例如，文件列表为空，或元数据未完全加载）
        renameBtn.disabled = true;
    }
}

// “选择目录”按钮点击事件。
selectDirBtn.addEventListener('click', () => {
    logMessage('请求选择目录...');
    toggleControls(true);
    ipcRenderer.send('select-directory');
});

// “选择文件”按钮点击事件。
selectFilesBtn.addEventListener('click', () => {
    logMessage('请求选择文件...');
    toggleControls(true);
    ipcRenderer.send('select-files');
});

// “开始重命名”按钮点击事件。
renameBtn.addEventListener('click', () => {
    if (filesWithMetadata.length > 0 && filesWithMetadata.length === selectedFilePaths.length) {
        const filesToActuallyRename = filesWithMetadata.filter(f => f.status === 'success' && path.basename(f.filePath) !== f.cleanedFileName);
        if (filesToActuallyRename.length === 0) {
            logMessage('没有需要重命名的文件（所有文件均已符合命名标准或元数据读取失败）。', 'warning');
            toggleControls(false); // 恢复按钮状态
            return;
        }
        logMessage(`准备重命名 ${filesToActuallyRename.length} 个文件...`, 'info');
        toggleControls(true);
        const payload = filesToActuallyRename.map(f => ({ oldPath: f.filePath, newFileName: f.cleanedFileName }));
        ipcRenderer.send('rename-files', payload);
    } else {
        logMessage('部分文件的元数据尚未加载完成，或没有有效文件可供重命名。', 'warning');
    }
});

// 监听主进程发送的已选择文件/目录的回复。
ipcRenderer.on('selected-files-reply', (event, files) => {
    selectedFilePaths = files;
    filesWithMetadata = []; // 重置元数据信息
    renameBtn.disabled = true; // 在开始获取元数据时禁用

    if (files.length > 0) {
        logMessage(`选择了 ${files.length} 个文件/目录中的文件。开始获取元数据...`);
        updateFileList(); // <--- 关键点：立即更新列表以显示原始路径
        files.forEach(filePath => {
            ipcRenderer.send('get-file-metadata', filePath);
        });
    } else {
        logMessage('没有选择任何文件。');
        updateFileList(); // 更新以显示占位符
    }
    // 选择按钮可以恢复，但重命名按钮需等待元数据
    selectDirBtn.disabled = false;
    selectFilesBtn.disabled = false;
});

// 监听主进程发送的单个文件的元数据结果。
ipcRenderer.on('file-metadata-result', (event, result) => {
    // 防止重复添加（虽然理论上不应发生）
    const existingIndex = filesWithMetadata.findIndex(f => f.filePath === result.filePath);
    if (existingIndex > -1) {
        filesWithMetadata[existingIndex] = result;
    } else {
        filesWithMetadata.push(result);
    }

    if (result.status === 'error') {
        logMessage(`文件 "${path.basename(result.filePath)}" 元数据获取失败: ${result.message}`, 'error');
    }
    
    updateFileList(); // 每次收到元数据都更新列表

    // 检查是否所有文件的元数据都已返回
    if (filesWithMetadata.length === selectedFilePaths.length) {
        logMessage('所有文件的元数据信息已处理完毕。');
        if (selectedFilePaths.length > 0) { // 只有在有文件且元数据都返回后才启用
             const hasFilesToRename = filesWithMetadata.some(f => f.status === 'success' && path.basename(f.filePath) !== f.cleanedFileName);
             if (hasFilesToRename) {
                renameBtn.disabled = false;
             } else {
                logMessage('所有文件均已符合命名标准或元数据读取失败，无需重命名。', 'info');
                renameBtn.disabled = true;
             }
        } else {
            renameBtn.disabled = true;
        }
    }
});

// 监听主进程发送的重命名操作结果。
ipcRenderer.on('rename-results', (event, results) => {
    results.forEach(result => {
        logMessage(result.message, result.status);
    });
    logMessage('所有重命名操作已完成。', 'info');
    selectedFilePaths = []; // 重命名完成后清空列表
    filesWithMetadata = [];
    updateFileList();
    toggleControls(false);
});

// 监听主进程发送的操作错误。
ipcRenderer.on('operation-error', (event, message) => {
    logMessage(message, 'error');
    toggleControls(false); // 操作出错，恢复按钮
});

// 初始化文件列表和按钮状态。
updateFileList();