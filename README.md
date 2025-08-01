<div align="center">
    <img src="assets/Music.png" alt="icon" width="150" height="150">
    <h1>音频文件批量重命名工具</h1>
    <p>一个基于 Electron 构建的桌面应用程序，旨在帮助您轻松地批量重命名音频文件，根据其内置的元数据生成新的文件名。</p>
</div>

## ✨ 功能特性

  * **选择文件或目录**：方便地选择单个音频文件或包含音频文件的整个目录进行处理。
  * **读取音频元数据**：自动从音频文件中提取艺术家和标题等 ID3 标签信息。
  * **预览新文件名**：在重命名之前，清晰地预览根据元数据生成的新文件名。
  * **批量重命名**：一键对选定的所有音频文件进行批量重命名。
  * **文件名清理**：自动移除或替换文件名中不允许的特殊字符 。
  * **日志记录**：详细的日志输出，让您清楚地了解文件的处理状态 。
  * **支持的格式**：`mp3`, `flac`, `ogg`, `m4a`, `aac`, `wma`, `wv`, `opus`, `dsf`, `dff`

## 🚀 快速开始（非开发者请在Release下载打包版本）

### 预备条件

在构建此应用程序之前，请确保您已安装：

  * Node.js (推荐 LTS 版本)
  * npm (Node.js 安装时通常会包含 npm)

### 安装

1.  克隆本仓库到您的本地计算机：

    ```bash
    git clone https://github.com/ChuwuYo/AudioRename.git
    cd AudioRename
    ```

2.  安装项目依赖：

    ```bash
    npm install
    ```

### 运行应用

在开发模式下运行应用程序：

```bash
npm start
```

### 打包应用 (可选)

如果您想为您的操作系统打包应用程序，可以运行以下命令：

```bash
npm run dist
# 或者如果您只想打包，不创建安装程序：
# npm run pack
```

打包后的文件将位于 `dist/` 目录下。

## 💡 使用方法

1.  **启动应用**：运行 `npm start` 命令。
2.  **选择文件或目录**：
      * 点击 "选择文件" 按钮来选择一个或多个音频文件 。
      * 点击 "选择目录" 按钮来选择一个包含音频文件的文件夹 。
3.  **预览**：一旦文件被选中，应用程序将自动读取它们的元数据并在界面上显示原始文件名和建议的新文件名。
4.  **开始重命名**：确认预览无误后，点击 "开始重命名" 按钮执行重命名操作 。
5.  **查看日志**：重命名过程中的任何成功、失败或警告信息都将在底部的日志区域显示 。


![image](https://github.com/user-attachments/assets/5cb7eacb-dd29-47c5-9584-f6b49947b648)


## 🛠️ 技术栈

  * **Electron**: 用于构建跨平台桌面应用程序 。
  * **Node.js**: 后端逻辑和文件系统操作 。
  * **music-metadata**: 用于解析音频文件的元数据 (ID3 标签) 。
  * **HTML/CSS/JavaScript**: 构建用户界面和前端交互 。
  * **Electron Builder**: 用于应用程序打包和分发 。

## 🤝 贡献

欢迎任何形式的贡献！如果您有改进建议或发现了 Bug，请随时提交 Pull Request 或创建 Issue。

## 📄 许可证

本项目采用 [GNU Affero General Public License v3.0](https://www.google.com/search?q=LICENSE) 许可。

-----
