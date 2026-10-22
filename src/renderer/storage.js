const KEY = 'writing-studio-data'

const hasElectron = () => typeof window !== 'undefined' && !!window.electronAPI

export const storage = {
  async load() {
    if (hasElectron()) {
      const data = await window.electronAPI.loadData()
      return data || null
    }
    try {
      const raw = localStorage.getItem(KEY)
      return raw ? JSON.parse(raw) : null
    } catch (err) {
      console.error('[storage] read failed:', err)
      throw err
    }
  },
  async save(data) {
    if (hasElectron()) {
      await window.electronAPI.saveData(data)
      return
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
    } catch (err) {
      console.error('[storage] write failed:', err)
    }
  }
}
