const { app, BrowserWindow, globalShortcut, ipcMain, screen: electronScreen, Tray, Menu, nativeImage } = require('electron');
const { join } = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  status?: string; // Optional for backward compatibility
  createdAt: string;
  completedAt?: string;
}

interface TodoStore {
  todos: Record<string, Todo[]>; // date string -> todos
  lastAccessed: string;
}

const store = new Store({
  defaults: {
    todos: {},
    lastAccessed: new Date().toISOString().split('T')[0]
  }
});

// Settings store for preferences
const settingsStore = new Store({
  name: 'settings',
  defaults: {
    keybindings: {
      global: {
        toggleApp: 'Alt+T'
      },
      navigation: {
        newTodo: 'n',
        editMode: 'e',
        deleteSelected: 'Delete',
        todayView: 't',
        checkUpdates: 'u',
        previousDay: 'ArrowLeft',
        nextDay: 'ArrowRight'
      },
      system: {
        preferences: process.platform === 'darwin' ? 'Cmd+,' : 'Ctrl+,',
        devTools: process.platform === 'darwin' ? 'Cmd+Option+I' : 'F12'
      }
    }
  }
});

let mainWindow: any = null;
let tray: any = null;
let isVisible = false;

function createWindow(): void {
  const { width, height } = electronScreen.getPrimaryDisplay().workAreaSize;
  
  mainWindow = new BrowserWindow({
    width: 600,
    height: 500,
    x: Math.round((width - 600) / 2),
    y: Math.round((height - 500) / 2),
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    transparent: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
  });

  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, 'index.html'));
  }

  // Removed blur event handler to prevent auto-hiding when clicking outside

  mainWindow.on('close', (event: any) => {
    if (!app.isQuiting) {
      event.preventDefault();
      hideWindow();
      return false;
    }
  });
}

function showWindow(): void {
  if (mainWindow) {
    isVisible = true;
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('window-shown');
  }
}

function hideWindow(): void {
  if (mainWindow) {
    isVisible = false;
    mainWindow.hide();
    mainWindow.webContents.send('window-hidden');
  }
}

function toggleWindow(): void {
  if (isVisible) {
    hideWindow();
  } else {
    showWindow();
  }
}

function registerGlobalShortcuts(): void {
  // Clear existing shortcuts
  globalShortcut.unregisterAll();
  
  const settings = settingsStore.get('keybindings') as any;
  
  // Register toggle app shortcut
  const toggleShortcut = settings.global.toggleApp;
  const ret = globalShortcut.register(toggleShortcut, () => {
    toggleWindow();
  });

  if (!ret) {
    console.log(`Failed to register shortcut: ${toggleShortcut}`);
  } else {
    console.log(`Registered global shortcut: ${toggleShortcut}`);
  }

  // Register DevTools toggle
  const devToolsShortcut = settings.system.devTools;
  globalShortcut.register(devToolsShortcut, () => {
    if (mainWindow && mainWindow.webContents) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });
}

function createTray(): void {
  // Create a simple 16x16 tray icon using SVG
  let icon;
  
  if (process.platform === 'darwin') {
    // Create a template icon for macOS (monochrome)
    icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(`
      <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="4" width="12" height="2" fill="black"/>
        <rect x="2" y="7" width="12" height="2" fill="black"/>
        <rect x="2" y="10" width="12" height="2" fill="black"/>
        <circle cx="4" cy="5" r="1" fill="white"/>
        <circle cx="4" cy="8" r="1" fill="white"/>
        <circle cx="4" cy="11" r="1" fill="white"/>
      </svg>
    `).toString('base64')}`);
    icon.setTemplateImage(true);
  } else {
    // For Windows/Linux, use a colored icon
    icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(`
      <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="16" height="16" fill="#2563eb" rx="2"/>
        <rect x="3" y="4" width="10" height="1.5" fill="white"/>
        <rect x="3" y="7" width="10" height="1.5" fill="white"/>
        <rect x="3" y="10" width="10" height="1.5" fill="white"/>
        <circle cx="4.5" cy="4.75" r="0.75" fill="#2563eb"/>
        <circle cx="4.5" cy="7.75" r="0.75" fill="#2563eb"/>
        <circle cx="4.5" cy="10.75" r="0.75" fill="#2563eb"/>
      </svg>
    `).toString('base64')}`);
  }
  
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show TodoCmd',
      click: () => showWindow()
    },
    {
      label: 'Toggle Window (Alt+t)',
      click: () => toggleWindow()
    },
    { type: 'separator' },
    {
      label: 'Toggle DevTools',
      click: () => {
        if (mainWindow && mainWindow.webContents) {
          if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools();
          } else {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
          }
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('TodoCmd - Press Alt+t to open');
  tray.setContextMenu(contextMenu);
  
  // Double-click to show window on all platforms
  tray.on('double-click', () => {
    toggleWindow();
  });
  
  // Single click on Windows/Linux to toggle
  if (process.platform !== 'darwin') {
    tray.on('click', () => {
      toggleWindow();
    });
  }
}

function rolloverTodos(): void {
  const today = new Date().toISOString().split('T')[0];
  const lastAccessed = store.get('lastAccessed');
  
  if (lastAccessed !== today) {
    const todos = store.get('todos');
    
    // Find the most recent date with todos (excluding today)
    const allDates = Object.keys(todos)
      .filter(date => date !== today && todos[date].length > 0)
      .sort()
      .reverse(); // Most recent first
    
    if (allDates.length > 0) {
      const mostRecentDate = allDates[0];
      const recentTodos = todos[mostRecentDate] || [];
      
      // Find incomplete todos from the most recent day with todos
      // Consider todos as incomplete if they're not completed or cancelled
      const incompleteTodos = recentTodos.filter((todo: Todo) => {
        // Check new status field first, fallback to completed field for backward compatibility
        const status = todo.status || (todo.completed ? 'completed' : 'pending');
        return status !== 'completed' && status !== 'cancelled';
      });
      
      if (incompleteTodos.length > 0) {
        // Move incomplete todos to today
        const todayTodos = todos[today] || [];
        const updatedIncompleteTodos = incompleteTodos.map((todo: Todo) => ({
          ...todo,
          id: `${Date.now()}-${Math.random()}`, // Generate new ID
          createdAt: today
        }));
        
        todos[today] = [...todayTodos, ...updatedIncompleteTodos];
        store.set('todos', todos);
        
        console.log(`Rolled over ${incompleteTodos.length} incomplete todos from ${mostRecentDate} to ${today}`);
      }
    }
    
    store.set('lastAccessed', today);
  }
}

// Auto-updater configuration
function checkForUpdates() {
  // Only check for updates in production
  if (process.env.NODE_ENV === 'development') {
    console.log('Skipping update check in development mode');
    // Show a notification in development
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        console.log('Update check triggered in development mode - updates are only available in production builds');
      `);
    }
    return;
  }

  console.log('Checking for updates...');
  
  // Add timeout for update check
  const updateTimeout = setTimeout(() => {
    console.log('Update check timed out');
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        console.log('⏰ Update check timed out - please check your internet connection');
      `);
    }
  }, 10000); // 10 second timeout

  // Clear timeout when any auto-updater event fires
  const clearTimeoutOnEvent = () => clearTimeout(updateTimeout);
  autoUpdater.once('checking-for-update', clearTimeoutOnEvent);
  autoUpdater.once('update-available', clearTimeoutOnEvent);
  autoUpdater.once('update-not-available', clearTimeoutOnEvent);
  autoUpdater.once('error', clearTimeoutOnEvent);

  try {
    autoUpdater.checkForUpdatesAndNotify();
  } catch (error) {
    clearTimeout(updateTimeout);
    console.error('Failed to initiate update check:', error);
    if (mainWindow) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      mainWindow.webContents.executeJavaScript(`
        console.error('❌ Failed to start update check:', '${errorMessage}');
      `);
    }
  }
}

// Auto-updater event handlers
autoUpdater.on('checking-for-update', () => {
  console.log('Checking for update...');
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      console.log('🔍 Checking for updates...');
      if (window.updateStatusCallback) window.updateStatusCallback('checking');
    `);
  }
});

autoUpdater.on('update-available', (info: any) => {
  console.log('Update available:', info);
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      console.log('📦 Update available: ${info.version}');
      if (window.updateStatusCallback) window.updateStatusCallback('available');
    `);
  }
});

autoUpdater.on('update-not-available', (info: any) => {
  console.log('Update not available:', info);
  if (mainWindow) {
    mainWindow.webContents.executeJavaScript(`
      console.log('✅ App is up to date!');
      if (window.updateStatusCallback) window.updateStatusCallback('not-available');
    `);
  }
});

autoUpdater.on('error', (err: any) => {
  console.log('Error in auto-updater:', err);
  if (mainWindow) {
    let errorMessage = 'Update check failed';
    if (err.message) {
      if (err.message.includes('ENOTFOUND') || err.message.includes('network')) {
        errorMessage = 'Network error - check your internet connection';
      } else if (err.message.includes('404')) {
        errorMessage = 'No releases found on GitHub';
      } else if (err.message.includes('rate limit')) {
        errorMessage = 'GitHub rate limit exceeded - try again later';
      } else {
        errorMessage = err.message;
      }
    }
    
    mainWindow.webContents.executeJavaScript(`
      console.error('❌ Update error:', '${errorMessage}');
      if (window.updateStatusCallback) window.updateStatusCallback('error');
    `);
  }
});

autoUpdater.on('download-progress', (progressObj: any) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  console.log(log_message);
});

autoUpdater.on('update-downloaded', (info: any) => {
  console.log('Update downloaded:', info);
  // Auto-install and restart
  autoUpdater.quitAndInstall();
});

app.whenReady().then(() => {
  // Hide from dock on macOS
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  createWindow();
  createTray();
  rolloverTodos();

  // Configure auto-updater
  if (process.env.NODE_ENV !== 'development') {
    console.log('Auto-updater configuration:');
    console.log('- App version:', app.getVersion());
    console.log('- Platform:', process.platform);
    console.log('- Arch:', process.arch);
    
    // Enable auto-updater logging
    autoUpdater.logger = console;
    
    // Force auto-updater to use GitHub provider
    // This should automatically detect the publish config from package.json
    autoUpdater.autoDownload = false; // Disable auto-download for better control
  }

  // Check for updates
  checkForUpdates();

  // Register global shortcuts from settings
  registerGlobalShortcuts();

  // IPC handlers
  ipcMain.handle('get-todos', (_: any, date: string) => {
    const todos = store.get('todos');
    return todos[date] || [];
  });

  ipcMain.handle('save-todos', (_: any, date: string, todos: Todo[]) => {
    const allTodos = store.get('todos');
    allTodos[date] = todos;
    store.set('todos', allTodos);
    return true;
  });

  ipcMain.handle('get-all-dates', () => {
    const todos = store.get('todos');
    return Object.keys(todos).sort().reverse();
  });

  ipcMain.handle('hide-window', () => {
    hideWindow();
  });

  // Auto-updater IPC handlers
  ipcMain.handle('check-for-updates', () => {
    checkForUpdates();
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('get-platform', () => {
    return process.platform;
  });

  // Settings IPC handlers
  ipcMain.handle('get-settings', () => {
    return settingsStore.store;
  });

  ipcMain.handle('save-settings', (_: any, settings: any) => {
    settingsStore.store = settings;
    
    // Re-register global shortcuts when settings change
    registerGlobalShortcuts();
    
    return true;
  });

  ipcMain.handle('get-setting', (_: any, key: string) => {
    return settingsStore.get(key);
  });

  ipcMain.handle('set-setting', (_: any, key: string, value: any) => {
    settingsStore.set(key, value);
    
    // Re-register global shortcuts if keybindings changed
    if (key === 'keybindings' || key.startsWith('keybindings.')) {
      registerGlobalShortcuts();
    }
    
    return true;
  });

  ipcMain.handle('reset-settings', () => {
    settingsStore.clear();
    registerGlobalShortcuts(); // Re-register with default shortcuts
    return settingsStore.store;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Keep the app running in the tray even when all windows are closed
  // Only quit on macOS if explicitly requested
  if (process.platform !== 'darwin' && app.isQuiting) {
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuiting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
  }
});
