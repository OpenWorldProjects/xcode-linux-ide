#!/usr/bin/env python3
"""Read Xcode metadata without running project scripts. Not an Xcode build engine."""
import fnmatch
import json
import re
import sys
from pathlib import Path
import xml.etree.ElementTree as ET


def openstep(text):
    # Tokenize strings before comments so URLs and script bodies remain intact.
    pattern = r'\s+|/\*.*?\*/|//[^\n]*|"(?:\\.|[^"\\])*"|[{}()=;,]|[^\s{}()=;,]+'
    tokens = [m.group() for m in re.finditer(pattern, text, re.S)
              if not m.group().isspace() and not m.group().startswith(('/*', '//'))]
    pos = 0

    def take(expected=None):
        nonlocal pos
        if pos >= len(tokens):
            raise ValueError('Unexpected end of project.pbxproj')
        token = tokens[pos]
        pos += 1
        if expected and token != expected:
            raise ValueError(f'Expected {expected}, found {token}')
        return token

    def value():
        token = take()
        if token == '{':
            result = {}
            while pos < len(tokens) and tokens[pos] != '}':
                key = value()
                take('=')
                result[key] = value()
                take(';')
            take('}')
            return result
        if token == '(':
            result = []
            while pos < len(tokens) and tokens[pos] != ')':
                result.append(value())
                if pos < len(tokens) and tokens[pos] == ',':
                    take(',')
            take(')')
            return result
        if token.startswith('"'):
            return re.sub(r'\\(.)', lambda m: {'n': '\n', 'r': '\r', 't': '\t'}.get(m[1], m[1]), token[1:-1])
        return token

    result = value()
    if pos != len(tokens):
        raise ValueError('Trailing project data')
    return result


def workspace_projects(workspace):
    base = workspace.parent
    refs = []
    def visit(node, group):
        location = node.get('location', '')
        kind, _, name = location.partition(':')
        resolved = (base if kind == 'container' else group) / name
        if kind == 'absolute':
            resolved = Path(name)
        if node.tag == 'FileRef' and name.endswith('.xcodeproj'):
            refs.append(resolved.resolve())
        for child in node:
            visit(child, resolved if node.tag == 'Group' and location else group)
    visit(ET.parse(workspace / 'contents.xcworkspacedata').getroot(), base)
    return refs


def read_scheme(file, base):
    root = ET.parse(file).getroot()
    launch = root.find('LaunchAction')
    def reference(node):
        return dict(node.attrib) if node is not None else None
    entries = []
    for entry in root.findall('./BuildAction/BuildActionEntries/BuildActionEntry'):
        ref = entry.find('BuildableReference')
        if ref is not None:
            entries.append({**reference(ref), 'buildForRunning': entry.get('buildForRunning') == 'YES'})
    environment, arguments = {}, []
    if launch is not None:
        environment = {e.get('key'): e.get('value', '') for e in launch.findall('./EnvironmentVariables/EnvironmentVariable') if e.get('isEnabled') == 'YES'}
        arguments = [a.get('argument', '') for a in launch.findall('./CommandLineArguments/CommandLineArgument') if a.get('isEnabled') == 'YES']
    return {'id': str(file), 'name': file.stem, 'base': str(base),
            'configuration': launch.get('buildConfiguration', 'Debug') if launch is not None else 'Debug',
            'buildTargets': entries, 'environment': environment, 'arguments': arguments,
            'runnable': reference(root.find('./LaunchAction/BuildableProductRunnable/BuildableReference')),
            'hasActions': bool(root.findall('.//ExecutionAction')),
            'actions': {tag: node.get('buildConfiguration') for tag in ['LaunchAction', 'TestAction', 'ProfileAction', 'ArchiveAction', 'AnalyzeAction'] if (node := root.find(tag)) is not None}}


def inspect(location):
    location = Path(location).resolve()
    if not location.exists():
        raise ValueError(f'Project path does not exist: {location}')
    if location.suffix in ('.xcworkspace', '.xcodeproj'):
        containers = [location]
    else:
        containers = sorted(location.glob('*.xcworkspace')) + sorted(location.glob('*.xcodeproj'))
        if not containers and (location / 'ios').is_dir():
            return inspect(location / 'ios')
    if not containers:
        raise ValueError('No .xcworkspace or .xcodeproj found. Select the project or its ios directory.')
    result = {'containers': [], 'projects': [], 'schemes': [], 'diagnostics': []}
    seen_projects, seen_schemes = set(), set()
    for container in containers:
        refs = workspace_projects(container) if container.suffix == '.xcworkspace' else [container]
        result['containers'].append({'path': str(container), 'name': container.name, 'projects': [str(p) for p in refs]})
        scheme_roots = [container] + refs
        for project in refs:
            if str(project) in seen_projects:
                continue
            seen_projects.add(str(project))
            if not (project / 'project.pbxproj').is_file():
                result['diagnostics'].append(f'Missing referenced project: {project}. Install project dependencies/Pods before building.')
                continue
            data = openstep((project / 'project.pbxproj').read_text())
            objects = data['objects']
            native = []
            for ident, obj in objects.items():
                if obj.get('isa') not in ('PBXNativeTarget', 'PBXAggregateTarget'):
                    continue
                configs = [objects[c] for c in objects.get(obj.get('buildConfigurationList'), {}).get('buildConfigurations', [])]
                phases = [{**objects[p], 'id': p} for p in obj.get('buildPhases', [])]
                native.append({'id': ident, 'name': obj.get('name'), 'productType': obj.get('productType'),
                               'configurations': [c['name'] for c in configs], 'phases': phases,
                               'productName': objects.get(obj.get('productReference'), {}).get('path', ''),
                               'dependencies': [objects[d].get('target', objects[d].get('targetProxy')) for d in obj.get('dependencies', [])]})
            result['projects'].append({'path': str(project), 'targets': native})
        for scheme_root in scheme_roots:
            for file in sorted(scheme_root.glob('xcshareddata/xcschemes/*.xcscheme')) + sorted(scheme_root.glob('xcuserdata/*/xcschemes/*.xcscheme')):
                if str(file) not in seen_schemes:
                    seen_schemes.add(str(file))
                    result['schemes'].append(read_scheme(file, scheme_root.parent))
    if not result['schemes']:
        # A simple application target can be built without a saved Xcode scheme.
        # Mark this explicitly; never invent pre-actions, launch settings or tests.
        for project in result['projects']:
            for target in project['targets']:
                if target['productType'] != 'com.apple.product-type.application':
                    continue
                ref = {'BlueprintIdentifier': target['id'], 'BlueprintName': target['name'],
                       'BuildableName': target['productName'],
                       'ReferencedContainer': 'container:' + Path(project['path']).name}
                result['schemes'].append({'id': 'target:' + project['path'] + ':' + target['id'],
                    'name': target['name'], 'generated': True, 'base': str(Path(project['path']).parent),
                    'configuration': 'Debug' if 'Debug' in target['configurations'] else target['configurations'][0],
                    'buildTargets': [{**ref, 'buildForRunning': True}], 'runnable': ref,
                    'environment': {}, 'arguments': [], 'hasActions': False, 'actions': {}})
        if not result['schemes']:
            result['diagnostics'].append('No saved scheme or runnable application target found.')
    base = location.parent if location.suffix in ('.xcworkspace', '.xcodeproj') else location
    result['environmentFiles'] = [str(p) for p in sorted(base.glob('.xcode.env*')) + sorted(base.parent.glob('.env*')) if p.is_file()]
    return result


def settings_for(project, target_id, configuration, sdk, overrides):
    data = openstep((Path(project) / 'project.pbxproj').read_text())
    objects = data['objects']
    base = Path(project).parent
    warnings, sources = [], []
    parents = {c: ident for ident, obj in objects.items() for c in obj.get('children', [])}
    settings = {'SRCROOT': str(base), 'PROJECT_DIR': str(base), 'CONFIGURATION': configuration, 'SDKROOT': sdk,
                'TARGET_NAME': objects.get(target_id, {}).get('name', ''), 'PROJECT_NAME': Path(project).stem}

    def file_path(ident, stack=()):
        if ident in stack:
            raise ValueError('Cyclic PBX group reference')
        obj = objects.get(ident)
        if not obj:
            return base
        tree = obj.get('sourceTree', '<group>')
        if tree not in ('<group>', 'SOURCE_ROOT', '<absolute>'):
            raise ValueError(f'Unsupported xcconfig sourceTree: {tree}')
        parent = file_path(parents[ident], stack + (ident,)) if tree == '<group>' and ident in parents else base
        return (parent / obj.get('path', '')).resolve()

    def merge(key, val):
        conditions = re.findall(r'\[([^=]+)=([^]]+)\]', key)
        for condition, pattern in conditions:
            if condition not in ('sdk', 'config'):
                warnings.append(f'Unsupported condition in {key}; value not applied')
                return
            if not fnmatch.fnmatch(sdk if condition == 'sdk' else configuration, pattern):
                return
        key = key.split('[')[0]
        val = ' '.join(val) if isinstance(val, list) else str(val)
        inherited = settings.get(key, '')
        settings[key] = val.replace('$(inherited)', inherited).replace('${inherited}', inherited)

    def config_file(file, stack=(), optional=False):
        if file in stack:
            raise ValueError(f'Cyclic xcconfig include: {file}')
        if not file.exists():
            if not optional:
                warnings.append(f'Missing xcconfig: {file}')
            return
        sources.append(str(file))
        text = re.sub(r'/\*.*?\*/', '', file.read_text(), flags=re.S).replace('\\\n', '')
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith('//'):
                continue
            include = re.match(r'#include(\?)?\s+["<](.*?)[">]', line)
            if include:
                config_file((file.parent / include[2]).resolve(), stack + (file,), bool(include[1]))
                continue
            assignment = re.match(r'([\w]+(?:\[[^]]+\])*)\s*=\s*(.*)', line)
            if assignment:
                merge(assignment[1], re.split(r'\s+//', assignment[2], maxsplit=1)[0].rstrip(';').strip())
            else:
                warnings.append(f'Unsupported xcconfig line in {file}: {line}')

    owners = []
    root_id = data.get('rootObject')
    if root_id and root_id in objects:
        owners.append(objects[root_id])
    if target_id and target_id in objects:
        owners.append(objects[target_id])

    for owner in owners:
        cfg_list_id = owner.get('buildConfigurationList')
        if not cfg_list_id or cfg_list_id not in objects:
            continue
        cfg_list = objects[cfg_list_id]
        configs = [objects[c] for c in cfg_list.get('buildConfigurations', []) if c in objects]
        config = next((c for c in configs if c.get('name') == configuration), None)
        if config is None:
            continue
        if config.get('baseConfigurationReference'):
            base_ref = config['baseConfigurationReference']
            if base_ref in objects:
                try:
                    config_file(file_path(base_ref))
                except Exception as ex:
                    warnings.append(f'Could not resolve xcconfig {base_ref}: {ex}')
        # Apply plain settings first, matching conditional settings afterward.
        for key, val in sorted(config.get('buildSettings', {}).items(), key=lambda kv: '[' in kv[0]):
            merge(key, val)
    for key, val in overrides.items():
        merge(key, val)
    raw = dict(settings)
    def expand(key, stack=()):
        if key in stack:
            warnings.append(f'Cyclic build setting: {key}')
            return '$(' + key + ')'
        return re.sub(r'\$\(([^)]+)\)|\$\{([^}]+)\}', lambda m: expand(m[1] or m[2], stack + (key,)) if (m[1] or m[2]) in raw else m[0], raw[key])
    resolved = {key: expand(key) for key in raw}
    for key, val in resolved.items():
        if '$(' in val or '${' in val:
            warnings.append(f'Unresolved build setting: {key}={val}')
    return {'values': resolved, 'sources': sources, 'diagnostics': sorted(set(warnings))}


def plan(request):
    report = inspect(request['projectPath'])
    scheme = next((s for s in report['schemes'] if s['id'] == request.get('scheme') or s['name'] == request.get('scheme')), None)
    if not scheme:
        raise ValueError('Choose an existing saved scheme.')
    matches = [s for s in report['schemes'] if s['name'] == request.get('scheme')]
    if len(matches) > 1:
        raise ValueError('Ambiguous scheme name. Select its full path.')
    configuration = request.get('configuration') or scheme['configuration']
    destination = request.get('destination', 'usb')
    if destination not in ('usb', 'isim', 'apple'):
        raise ValueError('Unknown destination')
    diagnostics = list(report['diagnostics'])
    targets = []
    refs = [r for r in scheme['buildTargets'] if r['buildForRunning']]
    for ref in refs:
        project = (Path(scheme['base']) / ref['ReferencedContainer'].removeprefix('container:')).resolve()
        found = next((p for p in report['projects'] if p['path'] == str(project)), None)
        if not found:
            diagnostics.append(f'Scheme target project unavailable: {project}')
            continue
        target = next((t for t in found['targets'] if t['id'] == ref['BlueprintIdentifier']), None)
        if not target:
            diagnostics.append(f'Scheme target missing: {ref["BlueprintName"]}')
            continue
        settings = settings_for(str(project), target['id'], configuration, 'iphoneos' if destination == 'usb' else 'iphonesimulator', request.get('buildSettings', {}))
        targets.append({**target, 'project': str(project), 'settings': settings})
    blockers = list(diagnostics)
    if destination != 'isim':
        blockers.append('Native device/Apple Simulator build backend is not implemented. No build or signing was attempted.')
    if scheme['hasActions']:
        blockers.append('Scheme pre/post actions need explicit backend support; they are not silently skipped.')
    return {'scheme': scheme, 'configuration': configuration, 'destination': destination,
            'targets': targets, 'diagnostics': diagnostics, 'blockers': blockers,
            'environmentFiles': report['environmentFiles'],
            'buildEnvironment': request.get('buildEnvironment', {}),
            'launchEnvironment': {**scheme['environment'], **request.get('launchEnvironment', {})},
            'launchArguments': request.get('launchArguments', scheme['arguments']),
            'note': 'Settings are a supported-subset preview. Actual compilation is delegated to isim; dependency and API compatibility are not guaranteed.'}


if __name__ == '__main__':
    try:
        request = json.load(sys.stdin)
        result = plan(request) if request.get('action') == 'plan' else inspect(request['projectPath'])
        print(json.dumps(result))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
