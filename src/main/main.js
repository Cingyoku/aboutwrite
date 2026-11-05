const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')

const dataFile = () => path.join(app.getPath('userData'), 'writing-studio-data.json')

ipcMain.handle('data:load', () => {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf8'))
  } catch (err) {
    console.error('[main] load data failed:', err.message)
    return null
  }
})

ipcMain.handle('data:save', (_event, data) => {
  try {
    const file = dataFile()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error('[main] save data failed:', err.message)
    return false
  }
})

ipcMain.handle('export:save', async (event, { name, data }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = await dialog.showSaveDialog(win, {
      title: '导出文件',
      defaultPath: name
    })
    if (res.canceled || !res.filePath) return { saved: false, canceled: true }
    fs.writeFileSync(res.filePath, Buffer.from(data))
    return { saved: true, path: res.filePath }
  } catch (err) {
    console.error('[main] export failed:', err.message)
    return { saved: false, error: err.message }
  }
})

// 批量导出：选一次文件夹，写入多个文件（自动重名追加序号）
ipcMain.handle('export:folder', async (event, { files }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = await dialog.showOpenDialog(win, {
      title: '选择导出文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths || !res.filePaths.length) return { saved: false, canceled: true }
    const folder = res.filePaths[0]
    const written = []
    const used = new Set()
    for (const f of files) {
      let name = String(f.name || '未命名')
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      let n = 1
      while (used.has(name)) name = `${base}(${++n})${ext}`
      used.add(name)
      fs.writeFileSync(path.join(folder, name), Buffer.from(f.data))
      written.push(path.join(folder, name))
    }
    return { saved: true, folder, paths: written }
  } catch (err) {
    console.error('[main] export folder failed:', err.message)
    return { saved: false, error: err.message }
  }
})

// 菜单「保存」：一键备份到既定路径（用户数据目录/backups），无需选择文件夹
ipcMain.handle('backup:save-quick', async (_event, { data }) => {
  try {
    const dir = path.join(app.getPath('userData'), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const name = `writing-studio-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`
    const file = path.join(dir, name)
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
    return { saved: true, path: file }
  } catch (err) {
    console.error('[main] quick backup failed:', err.message)
    return { saved: false, error: err.message }
  }
})

// 菜单「导入」：主进程打开文件对话框并读取备份（菜单触发的动态 input 响应不稳定）
ipcMain.handle('backup:import-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const res = await dialog.showOpenDialog(win, {
    title: '选择备份文件',
    defaultPath: app.getPath('documents'),
    filters: [{ name: '备份文件 (*.json)', extensions: ['json'] }],
    properties: ['openFile']
  })
  if (res.canceled || !res.filePaths || !res.filePaths.length) return { canceled: true }
  const file = res.filePaths[0]
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { canceled: false, path: file, data }
  } catch (err) {
    return { canceled: false, path: file, error: err.message || String(err) }
  }
})

// PDF 导出：隐藏窗口渲染 HTML 后 printToPDF
ipcMain.handle('export:pdf', async (event, { name, html }) => {
  let pdfWin = null
  try {
    pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await pdfWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await pdfWin.webContents.printToPDF({ printBackground: true })
    const parent = BrowserWindow.fromWebContents(event.sender)
    const res = await dialog.showSaveDialog(parent, {
      title: '导出 PDF',
      defaultPath: name
    })
    if (res.canceled || !res.filePath) return { saved: false, canceled: true }
    fs.writeFileSync(res.filePath, pdf)
    return { saved: true, path: res.filePath }
  } catch (err) {
    console.error('[main] pdf export failed:', err.message)
    return { saved: false, error: err.message }
  } finally {
    if (pdfWin) pdfWin.destroy()
  }
})

// 本地备份：用户自由选择文件夹，写入带时间戳的备份文件
ipcMain.handle('backup:save', async (event, { data }) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = await dialog.showOpenDialog(win, {
      title: '选择本地备份文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths || !res.filePaths.length) return { saved: false, canceled: true }
    const folder = res.filePaths[0]
    const d = new Date()
    const p = (n) => String(n).padStart(2, '0')
    const name = `writing-studio-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`
    const file = path.join(folder, name)
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
    return { saved: true, path: file }
  } catch (err) {
    console.error('[main] backup failed:', err.message)
    return { saved: false, error: err.message }
  }
})

const INTRO_TEXT = [
  'Writing Studio 是一款本地写作软件，全部数据保存在本机，无需登录。',
  '',
  '使用介绍：',
  '一、我的文章（新建方式）',
  '  · 主页输入标题回车或点「+ 新建文章」创建，点击卡片进入文章工作区。',
  '二、我的灵感（新建方式）',
  '  · 主页输入标题回车或点「+ 新建灵感」创建，标题留空则默认「未命名灵感」，点击卡片展开编辑。',
  '三、人物关系',
  '  · 文章工作区列头「+ 新建」直接创建关系图；添加人物与阵营（一人可加入多个阵营）、连线建立关系。',
  '  · 选中人物弹出信息浮窗：默认在工作区右侧上浮，可在整个窗口内自由拖动、可关闭。',
  '  · 画布可拖动人物、平移视图、滚轮缩放；列头「最大化」全屏显示（画布占屏幕约 90%）。',
  '四、时间轴',
  '  · 列头「+ 新建」直接新建文段，填写时间、事件与描述，可拖拽排序、关联章节与人物（关联面板支持搜索人物）。',
  '五、章节',
  '  · 列头「+ 新建」添加章节并自由书写，选中文字可加粗、斜体。',
  '  · 列头「顺序」键切换章节正序 / 逆序显示（默认正序）。',
  '  · 列头「导出」打开导出面板：选择全部文本窗口或指定文本窗口，格式支持 .md / .rtf / .png，保留编辑器中设置的加粗、斜体与字号、缩进。',
  '六、批量删除',
  '  · 主页右栏「批量删除」点「进入批量模式」，勾选多个文章或灵感（可全选 / 清空），点「删除所选」一次性删除。',
  '七、批量导出',
  '  · 主页右栏「批量导出」点「进入批量模式」，勾选多个文章或灵感，点「导出所选」并选择一次文件夹，逐个导出为独立 .rtf 文件（重名自动加序号）。',
  '八、本地备份',
  '  · 主页右栏「本地备份」：将全部数据快照保存为 JSON 文件到自选文件夹。',
  '  · 菜单「文件 → 保存」（Ctrl+S）：一键备份到本机数据目录的 backups 文件夹，无需选择路径。',
  '九、本地导入',
  '  · 主页右栏「本地导入」：选择备份 .json 文件，确认后覆盖当前全部数据。',
  '  · 菜单「文件 → 导入」：选择备份 .json 文件恢复数据。',
  '',
  '文章工作区顶部：「大纲」记录母任务内容；「导入」读取人物关系或时间轴表格文件（.rtf / .csv / .svc，按表头自动识别类型）；「导出」弹出导出面板，勾选「章节全部内容（合并为一个文档）」「人物关系」「时间轴」并各自选择格式（章节：.rtf / .pdf，关系与时间轴：.svg / .csv）。'
].join('\n')

function showIntro() {
  const win = BrowserWindow.getAllWindows()[0]
  dialog.showMessageBox(win, {
    type: 'info',
    title: '软件介绍',
    message: 'Writing Studio 使用介绍',
    detail: INTRO_TEXT,
    buttons: ['知道了']
  })
}

function buildMenu() {
  const send = (name) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.webContents.send('menu-action', name)
  }
  const template = [
    {
      label: '文件(F)',
      submenu: [
        {
          label: '保存',
          accelerator: 'CmdOrCtrl+S',
          click: () => send('save-backup')
        },
        {
          label: '导入',
          click: () => send('import-backup')
        },
        { type: 'separator' },
        { label: '退出', role: 'quit' }
      ]
    },
    {
      label: '编辑(E)',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图(V)',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { type: 'separator' },
        { label: '进入 / 退出全屏', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口(W)',
      submenu: [{ label: '最小化', role: 'minimize' }, { label: '关闭窗口', role: 'close' }]
    },
    {
      label: '帮助(H)',
      submenu: [{ label: '软件介绍', click: showIntro }]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Writing Studio',
    backgroundColor: '#FFFFFF',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }
}

app.whenReady().then(() => {
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
