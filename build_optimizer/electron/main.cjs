const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');

let mainWindow;
let assetServer;
const LOCAL_SERVER_PORT = 9117;

function getDataDirectory() {
  if (process.env.MWI_DATA_DIR) {
    return path.resolve(process.env.MWI_DATA_DIR);
  }
  // electron-builder's portable target extracts to a temporary directory. This
  // environment variable points to the directory that contains the real .exe.
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
  }
  if (app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'data');
  }
  return path.join(app.getAppPath(), 'data');
}

app.setPath('userData', getDataDirectory());

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function startAssetServer() {
  const distDirectory = path.join(app.getAppPath(), 'dist');
  assetServer = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^[/\\]+/, '');
    const filePath = path.resolve(distDirectory, relativePath);
    if (!filePath.startsWith(distDirectory + path.sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(filePath, (error, content) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      response.end(content);
    });
  });
  return new Promise((resolve) => {
    assetServer.listen(LOCAL_SERVER_PORT, '127.0.0.1', () => resolve(LOCAL_SERVER_PORT));
  });
}

async function createMainWindow() {
  const port = await startAssetServer();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1000,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (assetServer) assetServer.close();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
