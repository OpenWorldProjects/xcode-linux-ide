const $ = id => document.getElementById(id);
let report = null;
let busy = false;
const log = text => { $('consoleLog').textContent += '\n' + text; $('consoleLog').scrollTop = $('consoleLog').scrollHeight; };
async function api(route, data = {}) {
  const res = await fetch('/api/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || result.output || 'Request failed');
  return result;
}
function options(id, values) {
  $(id).replaceChildren(...values.map(([value, label]) => {
    const option = document.createElement('option'); option.value = value; option.textContent = label; return option;
  }));
}
function selectedScheme() { return report?.schemes.find(s => s.id === $('schemePickerInput').value); }
function request() {
  const data = { projectPath: $('workspacePicker').value, scheme: $('schemePickerInput').value,
    configuration: $('configurationPicker').value, destination: $('devicePicker').value };
  for (const field of ['buildEnvironment', 'launchEnvironment', 'buildSettings']) data[field] = JSON.parse($(field).value || '{}');
  if ($('launchArguments').value.trim()) data.launchArguments = JSON.parse($('launchArguments').value);
  return data;
}
function refreshButtons() {
  const ready = Boolean(selectedScheme());
  $('btnBuild').disabled = busy || !ready || $('devicePicker').value !== 'isim';
  $('btnRun').disabled = $('btnBuild').disabled;
  $('inspectPlan').disabled = busy || !ready;
  $('btnBuild').title = $('devicePicker').value === 'isim' ? 'Build selected scheme with isim' : 'Device/Apple Simulator build backend not implemented; inspect the plan instead';
}
function schemeChanged() {
  const scheme = selectedScheme();
  const configs = [...new Set(report.projects.flatMap(p => p.targets.flatMap(t => t.configurations)))];
  options('configurationPicker', configs.map(c => [c, c]));
  if (scheme && configs.includes(scheme.configuration)) $('configurationPicker').value = scheme.configuration;
  $('launchEnvironment').value = '{}';
  $('launchArguments').value = '';
  refreshButtons();
}
async function openProject(projectPath) {
  report = null; refreshButtons();
  const metadata = await api('project', { projectPath });
  options('workspacePicker', metadata.containers.map(c => [c.path, c.name]));
  $('projectPath').value = projectPath;
  await selectContainer();
}
async function selectContainer() {
  const projectPath = $('workspacePicker').value;
  report = await api('project', { projectPath });
  $('projectName').textContent = report.containers[0].name;
  options('schemePickerInput', report.schemes.map(s => [s.id, s.name]));
  $('projectDiagnostics').textContent = report.diagnostics.join('\n');
  schemeChanged();
  const files = await api('files', { projectPath });
  $('fileTree').replaceChildren(...files.map(file => {
    const item = document.createElement('div'); item.className = 'tree-item';
    item.textContent = file.path.slice(projectPath.slice(0, projectPath.lastIndexOf('/')).length + 1);
    item.addEventListener('click', () => safe(async () => {
      const result = await api('file-content', { projectPath, filePath: file.path });
      $('activeTabName').textContent = file.name; $('codeEditor').value = result.content;
    }));
    return item;
  }));
  $('statusText').textContent = 'Project loaded';
}
async function safe(fn) { try { await fn(); } catch (error) { log(error.message); $('statusText').textContent = 'Action failed — see output'; } }
$('openProject').onclick = () => safe(() => openProject($('projectPath').value));
$('sampleProject').onclick = () => safe(() => openProject('test-projects/rnn-upstream/playground/ios'));
$('workspacePicker').onchange = () => safe(selectContainer);
$('schemePickerInput').onchange = schemeChanged;
$('inspectPlan').onclick = () => safe(async () => {
  const plan = await api('plan', request());
  log(JSON.stringify(plan, null, 2));
  $('projectDiagnostics').textContent = plan.blockers.join('\n') || 'Plan inspected. Backend compatibility still requires a build.';
});
for (const action of ['build', 'run']) {
  $(action === 'build' ? 'btnBuild' : 'btnRun').onclick = () => safe(async () => {
    const selection = request(); busy = true; refreshButtons();
    $('statusText').textContent = `${action}: ${$('schemePickerInput').selectedOptions[0].textContent} (${selection.configuration})`;
    try {
      const result = await api(action, selection); log(result.output);
      $('statusText').textContent = action === 'build' ? 'Build succeeded' : 'Build succeeded; isim launch requested';
    } finally { busy = false; refreshButtons(); }
  });
}
function updateTargetView() {
  const target = $('devicePicker').value;
  $('isimPanel').hidden = target !== 'isim'; $('mirrorIframe').hidden = target === 'isim';
  const host = window.location.hostname || '127.0.0.1';
  $('mirrorIframe').src = target === 'isim' ? 'about:blank' : target === 'apple' ? `http://${host}:6080/vnc.html?autoconnect=true` : `http://${host}:8080`;
  $('connBadge').textContent = target === 'isim' ? 'isim • Desktop window' : target === 'apple' ? 'Apple Simulator • Port 6080' : 'USB Mirror • Port 8080';
  refreshButtons();
}
$('devicePicker').onchange = updateTargetView;
$('openIsim').onclick = () => safe(async () => log((await api('isim/open')).message));
$('clearConsole').onclick = () => { $('consoleLog').textContent = ''; };
for (const [button, panel] of [['toggleMirror', 'mirrorPanel'], ['toggleConsole', 'consolePanel']]) {
  $(button).onclick = () => { $(panel).style.display = $(panel).style.display === 'none' ? 'flex' : 'none'; $(button).classList.toggle('active'); };
}
window.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && ['b', 'r'].includes(event.key)) {
    event.preventDefault(); $(event.key === 'b' ? 'btnBuild' : 'btnRun').click();
  }
});
updateTargetView();
