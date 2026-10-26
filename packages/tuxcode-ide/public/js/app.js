const editor = document.getElementById('codeEditor');
const activeTab = document.getElementById('activeTabName');
const statusText = document.getElementById('statusText');
const consoleLog = document.getElementById('consoleLog');
const btnBuild = document.getElementById('btnBuild');
const btnRun = document.getElementById('btnRun');
const toggleMirror = document.getElementById('toggleMirror');
const mirrorPanel = document.getElementById('mirrorPanel');
const toggleConsole = document.getElementById('toggleConsole');
const consolePanel = document.getElementById('consolePanel');
const fileItems = document.querySelectorAll('.tree-item');

const DEFAULT_IOS_DIR = '/home/ella/Projects/xcode-linux-ide/test-projects/rn-wix-sample/ios';

// File mapping
const files = {
  'AppDelegate.mm': `${DEFAULT_IOS_DIR}/RNWixApp/AppDelegate.mm`,
  'AppDelegate.h': `${DEFAULT_IOS_DIR}/RNWixApp/AppDelegate.h`,
  'main.m': `${DEFAULT_IOS_DIR}/RNWixApp/main.m`,
  'Info.plist': `${DEFAULT_IOS_DIR}/RNWixApp/Info.plist`,
  'Podfile': `${DEFAULT_IOS_DIR}/Podfile`
};

let currentFile = 'AppDelegate.mm';

async function loadFile(name) {
  currentFile = name;
  activeTab.textContent = name;
  const filePath = files[name];
  try {
    const res = await fetch(`/api/file-content?path=${encodeURIComponent(filePath)}`);
    if (res.ok) {
      editor.value = await res.text();
    }
  } catch (err) {
    editor.value = `// Failed to load ${name}: ${err.message}`;
  }
}

fileItems.forEach(item => {
  item.addEventListener('click', () => {
    fileItems.forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    loadFile(item.getAttribute('data-file'));
  });
});

// Build Action
btnBuild.addEventListener('click', async () => {
  statusText.textContent = 'RNWixApp : Compiling with Clang & Ninja...';
  log('[TuxCode] Starting Build...');
  try {
    const res = await fetch('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: DEFAULT_IOS_DIR })
    });
    const data = await res.json();
    log(data.output);
    if (data.success) {
      statusText.textContent = 'RNWixApp : Build Succeeded';
    } else {
      statusText.textContent = 'RNWixApp : Build Failed';
    }
  } catch (err) {
    log('[Error] ' + err.message);
    statusText.textContent = 'RNWixApp : Build Failed';
  }
});

// Run Action
btnRun.addEventListener('click', async () => {
  statusText.textContent = 'RNWixApp : Deploying to iPhone over USB...';
  log('[TuxCode] Deploying to iPhone over USB...');
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath: DEFAULT_IOS_DIR })
    });
    const data = await res.json();
    log(data.output);
    if (data.success) {
      statusText.textContent = 'RNWixApp : Running on iPhone';
    } else {
      statusText.textContent = 'RNWixApp : Deploy Finished';
    }
  } catch (err) {
    log('[Error] ' + err.message);
    statusText.textContent = 'RNWixApp : Deploy Failed';
  }
});

function log(text) {
  consoleLog.textContent += '\n' + text;
  consoleLog.scrollTop = consoleLog.scrollHeight;
}

document.getElementById('clearConsole').addEventListener('click', () => {
  consoleLog.textContent = '';
});

toggleMirror.addEventListener('click', () => {
  mirrorPanel.style.display = mirrorPanel.style.display === 'none' ? 'flex' : 'none';
  toggleMirror.classList.toggle('active');
});

toggleConsole.addEventListener('click', () => {
  consolePanel.style.display = consolePanel.style.display === 'none' ? 'flex' : 'none';
  toggleConsole.classList.toggle('active');
});

// Keyboard shortcuts (⌘B / Ctrl+B for build, ⌘R / Ctrl+R for run)
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
    e.preventDefault();
    btnBuild.click();
  } else if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
    e.preventDefault();
    btnRun.click();
  }
});

// Target Switching: Real iPhone 16 Pro (USB Mirror) <-> Real Apple iOS Simulator (macOS KVM)
const deviceLabel = document.getElementById('deviceLabel');
const schemePicker = document.getElementById('schemePicker');
const connBadge = document.getElementById('connBadge');
const mirrorIframe = document.getElementById('mirrorIframe');

let isSimulatorMode = false;

function updateTargetView() {
  const host = window.location.hostname || '127.0.0.1';
  if (isSimulatorMode) {
    deviceLabel.textContent = 'Apple iOS Simulator (macOS KVM)';
    connBadge.textContent = 'KVM Active • Port 6080';
    if (mirrorIframe) {
      mirrorIframe.src = `http://${host}:6080/vnc.html?autoconnect=true`;
    }
  } else {
    deviceLabel.textContent = 'Physical iPhone (USB)';
    connBadge.textContent = 'USB Connected • 43 FPS';
    if (mirrorIframe) {
      mirrorIframe.src = `http://${host}:8080`;
    }
  }
}

if (schemePicker) {
  schemePicker.style.cursor = 'pointer';
  schemePicker.title = 'Click to switch between Physical iPhone and Apple iOS Simulator';
  schemePicker.addEventListener('click', () => {
    isSimulatorMode = !isSimulatorMode;
    updateTargetView();
  });
}

// Initial target setup
updateTargetView();

// Initial load
loadFile('AppDelegate.mm');
