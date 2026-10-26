const vscode = require('vscode');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const runFile = promisify(execFile);

function buildTool() {
  const root = vscode.workspace.getConfiguration('tuxcode').get('toolchainRoot');
  return root ? path.join(root, 'bin/tuxcodebuild') : 'tuxcodebuild';
}

async function runBuildTool(args) {
  const { stdout } = await runFile(buildTool(), args, { timeout: args[0] === 'devices' ? 8000 : 300000, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

let statusBarItem;
let mirrorWebviewPanel = null;

function activate(context) {
  if (!vscode.workspace.isTrusted) return;
  if (process.platform === 'win32') {
    vscode.window.showWarningMessage('TuxCode: Reopen this folder in WSL using the WSL extension.');
    return;
  }

  // Create Output Channel for Build & Logs
  const outputChannel = vscode.window.createOutputChannel('TuxCode iOS');
  context.subscriptions.push(outputChannel);

  // Status Bar Item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'workbench.view.extension.tuxcode-explorer';
  context.subscriptions.push(statusBarItem);
  updateStatusBar();

  // Polling device status every 10s
  const interval = setInterval(updateStatusBar, 10000);
  context.subscriptions.push({ dispose: () => clearInterval(interval) });

  // 1. Build Command
  const buildCmd = vscode.commands.registerCommand('tuxcode.build', async () => {
    outputChannel.show(true);
    outputChannel.appendLine('[TuxCode] Starting iOS compilation...');

    const folders = vscode.workspace.workspaceFolders;
    const workspaceRoot = folders && folders[0] ? folders[0].uri.fsPath : process.cwd();
    const iosDir = path.join(workspaceRoot, 'ios');

    try {
      vscode.window.showInformationMessage('TuxCode: Compiling iOS project with Clang & Ninja...');
      const output = await runBuildTool(['build', iosDir]);
      outputChannel.append(output);
      vscode.window.showInformationMessage('TuxCode: ✅ iOS Build Succeeded!');
    } catch (err) {
      outputChannel.append(err.stdout || err.stderr || err.message);
      vscode.window.showErrorMessage('TuxCode: ❌ Build Failed. See TuxCode output channel.');
    }
  });

  // 2. Run Command
  const runCmd = vscode.commands.registerCommand('tuxcode.run', async () => {
    outputChannel.show(true);
    outputChannel.appendLine('[TuxCode] Deploying to connected iPhone...');

    const folders = vscode.workspace.workspaceFolders;
    const workspaceRoot = folders && folders[0] ? folders[0].uri.fsPath : process.cwd();
    const iosDir = path.join(workspaceRoot, 'ios');

    try {
      vscode.window.showInformationMessage('TuxCode: Building and deploying to iPhone...');
      const output = await runBuildTool(['run', iosDir]);
      outputChannel.append(output);
      vscode.window.showInformationMessage('TuxCode: ✅ App installed and launched on device!');
    } catch (err) {
      outputChannel.append(err.stdout || err.stderr || err.message);
      vscode.window.showErrorMessage('TuxCode: ❌ Deployment failed.');
    }
  });

  // 3. Mirror Webview Command (Opens phone screen in a VS Code tab!)
  const mirrorCmd = vscode.commands.registerCommand('tuxcode.mirror', async () => {
    if (mirrorWebviewPanel) {
      mirrorWebviewPanel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    mirrorWebviewPanel = vscode.window.createWebviewPanel(
      'tuxcodeMirror',
      '📱 iOS Device Live View',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    try {
      const uri = await vscode.env.asExternalUri(vscode.Uri.parse('http://127.0.0.1:8080'));
      if (mirrorWebviewPanel) mirrorWebviewPanel.webview.html = getMirrorWebviewContent(uri.toString());
    } catch (err) {
      vscode.window.showErrorMessage(`TuxCode mirror forwarding failed: ${err.message}`);
    }

    mirrorWebviewPanel.onDidDispose(() => {
      mirrorWebviewPanel = null;
    });
  });

  // 4. Doctor Command
  const doctorCmd = vscode.commands.registerCommand('tuxcode.doctor', async () => {
    outputChannel.show(true);
    try {
      const output = await runBuildTool(['doctor']);
      outputChannel.append(output);
    } catch (err) {
      outputChannel.append(err.stdout || err.message);
    }
  });

  // Register commands
  context.subscriptions.push(buildCmd, runCmd, mirrorCmd, doctorCmd);

  // Register Tree Views
  vscode.window.registerTreeDataProvider('tuxcode.devices', new DevicesTreeDataProvider());
  vscode.window.registerTreeDataProvider('tuxcode.actions', new ActionsTreeDataProvider());
}

async function updateStatusBar() {
  try {
    const raw = await runBuildTool(['devices']);
    if (raw.includes('[Device]')) {
      const line = raw.split('\n').find(l => l.includes('[Device]'));
      const devName = line.replace('[Device]', '').split('- UDID')[0].trim();
      statusBarItem.text = `$(device-mobile) ${devName}`;
      statusBarItem.tooltip = 'TuxCode: Connected via USB. Click to manage.';
      statusBarItem.show();
    } else {
      statusBarItem.text = '$(device-mobile) No iOS Device';
      statusBarItem.tooltip = 'Plug in an iPhone over USB to build and run.';
      statusBarItem.show();
    }
  } catch {
    statusBarItem.hide();
  }
}

class DevicesTreeDataProvider {
  getTreeItem(element) { return element; }
  async getChildren() {
    try {
      const raw = await runBuildTool(['devices']);
      const items = [];
      const lines = raw.trim().split('\n').filter(l => l.includes('[Device]'));
      for (const line of lines) {
        const item = new vscode.TreeItem(line.replace('[Device]', '').trim(), vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('device-mobile');
        item.command = { command: 'tuxcode.mirror', title: 'Open Mirror' };
        items.push(item);
      }
      return items.length > 0 ? items : [new vscode.TreeItem('No devices connected over USB')];
    } catch {
      return [new vscode.TreeItem('Unable to detect devices')];
    }
  }
}

class ActionsTreeDataProvider {
  getTreeItem(element) { return element; }
  getChildren() {
    const actions = [
      { label: 'Run on Device ▶', cmd: 'tuxcode.run', icon: 'play' },
      { label: 'Build iOS Project 🔨', cmd: 'tuxcode.build', icon: 'gear' },
      { label: 'Open Live Screen Mirror 📱', cmd: 'tuxcode.mirror', icon: 'device-mobile' },
      { label: 'Toolchain Doctor 🩺', cmd: 'tuxcode.doctor', icon: 'checklist' }
    ];

    return actions.map(a => {
      const item = new vscode.TreeItem(a.label, vscode.TreeItemCollapsibleState.None);
      item.iconPath = new vscode.ThemeIcon(a.icon);
      item.command = { command: a.cmd, title: a.label };
      return item;
    });
  }
}

function getMirrorWebviewContent(url) {
  const escaped = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const origin = new URL(url).origin;
  return `<!DOCTYPE html>
  <html>
  <head>
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; style-src 'unsafe-inline';">
    <style>
      body { margin: 0; padding: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden; }
      iframe { width: 100%; height: 100%; border: none; }
    </style>
  </head>
  <body>
    <iframe src="${escaped}"></iframe>
  </body>
  </html>`;
}

function deactivate() {
  if (statusBarItem) statusBarItem.dispose();
}

module.exports = { activate, deactivate };
