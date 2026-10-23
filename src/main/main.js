const { app, BrowserWindow, ipcMain, dialog } = require('electron')
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
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
