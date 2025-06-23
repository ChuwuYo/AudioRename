1. ~~在 待处理文件 区分 名称符合标准的文件 和 不符合标准的文件 （无需处理的文件 / 需处理的文件）~~
   
   - ~~待处理文件 卡片右侧 添加三个筛选功能键：全部/名称符合标准/名称不符合标准（All / √ / ×）~~

2. 实现改变文件排列顺序，例如按文件名、文件大小或修改时间进行排序
   
   - 简易实现方式：
     
     1. 数据收集：
        
        - 文件名： 现有代码中已经包含了文件名信息，可以直接使用。
        - 文件大小和修改时间： 目前的代码在获取文件元数据时没有包含文件大小和修改时间。您需要在 `main.js` 的 `findAudioFilesInDirectory` 函数中，使用 fs.stat() 方法获取每个文件的 size （大小）和 mtime （修改时间），并将这些信息添加到 filesWithMetadata 数组中。
     
     2. 前端界面：
        
        - 在 `index.html` 中添加 UI 元素，例如一个下拉菜单或一组按钮，让用户可以选择排序方式（按文件名、按文件大小、按修改时间）。
     
     3. 排序逻辑：
        
        - 在 `renderer.js` 的 `updateFileList` 函数中，找到对 filesWithMetadata 数组进行排序的代码行
        - 根据用户选择的排序方式，修改 sort() 方法的比较函数。例如：
          - 按文件名排序： (a, b) => a.cleanedFileName.localeCompare(b.cleanedFileName)
          - 按文件大小排序： (a, b) => a.size - b.size
          - 按修改时间排序： (a, b) => a.mtime.getTime() - b.mtime.getTime()