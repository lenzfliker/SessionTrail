const { app, BrowserWindow } = require('electron');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  try {
    await win.loadURL('https://example.com');
    console.log('LOAD_OK');
    setTimeout(() => app.quit(), 3000);
  } catch (error) {
    console.error('LOAD_FAIL', error);
    app.quit();
  }
});
