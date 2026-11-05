const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  exportFile: (payload) => ipcRenderer.invoke('export:save', payload),
  exportFolder: (files) => ipcRenderer.invoke('export:folder', { files }),
  saveBackup: (data) => ipcRenderer.invoke('backup:save', { data }),
  saveBackupQuick: (data) => ipcRenderer.invoke('backup:save-quick', { data }),
  importBackupDialog: () => ipcRenderer.invoke('backup:import-dialog'),
  exportPdf: (payload) => ipcRenderer.invoke('export:pdf', payload),
  onMenuAction: (cb) => ipcRenderer.on('menu-action', (_event, name) => cb(name))
})
