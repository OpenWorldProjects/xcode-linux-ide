const fs = require('fs');
const path = require('path');

class WorkspaceParser {
  constructor(iosDirPath) {
    this.iosDir = path.resolve(iosDirPath);
  }

  detectStructure() {
    if (!fs.existsSync(this.iosDir)) {
      throw new Error(`Directory not found: ${this.iosDir}`);
    }

    const files = fs.readdirSync(this.iosDir);
    let workspaces = files.filter(f => f.endsWith('.xcworkspace')).map(w => path.join(this.iosDir, w));
    let projects = files.filter(f => f.endsWith('.xcodeproj')).map(p => path.join(this.iosDir, p));

    // If none found directly, search one level deeper
    if (workspaces.length === 0 && projects.length === 0) {
      for (const item of files) {
        const subPath = path.join(this.iosDir, item);
        if (fs.statSync(subPath).isDirectory()) {
          const subFiles = fs.readdirSync(subPath);
          for (const sf of subFiles) {
            if (sf.endsWith('.xcworkspace')) workspaces.push(path.join(subPath, sf));
            if (sf.endsWith('.xcodeproj')) projects.push(path.join(subPath, sf));
          }
        }
      }
    }

    const hasPodfile = files.includes('Podfile');
    const hasPodfileLock = files.includes('Podfile.lock');
    const hasPodsDir = files.includes('Pods') && fs.statSync(path.join(this.iosDir, 'Pods')).isDirectory();

    return {
      iosDir: this.iosDir,
      workspaces,
      projects,
      hasPodfile,
      hasPodfileLock,
      hasPodsDir
    };
  }

  parseWorkspace(workspacePath) {
    const dataFile = path.join(workspacePath, 'contents.xcworkspacedata');
    if (!fs.existsSync(dataFile)) {
      throw new Error(`Workspace data not found: ${dataFile}`);
    }

    const xml = fs.readFileSync(dataFile, 'utf-8');
    const projectRefs = [];
    const locationRegex = /location\s*=\s*"([^"]+)"/g;
    let match;
    while ((match = locationRegex.exec(xml)) !== null) {
      const loc = match[1];
      if (loc.startsWith('group:')) {
        const relPath = loc.replace('group:', '');
        projectRefs.push(path.resolve(this.iosDir, relPath));
      } else if (loc.startsWith('container:')) {
        const relPath = loc.replace('container:', '');
        projectRefs.push(path.resolve(this.iosDir, relPath));
      }
    }

    return {
      workspacePath,
      projectRefs
    };
  }

  parseProjectPbx(projectPath) {
    const pbxFile = path.join(projectPath, 'project.pbxproj');
    if (!fs.existsSync(pbxFile)) {
      throw new Error(`PBX file not found: ${pbxFile}`);
    }

    const content = fs.readFileSync(pbxFile, 'utf-8');

    // Extract native target names
    const targets = [];
    const targetBlockRegex = /isa\s*=\s*PBXNativeTarget;[\s\S]*?name\s*=\s*"?([^";]+)"?;[\s\S]*?productType\s*=\s*"([^"]+)";/g;
    let match;
    while ((match = targetBlockRegex.exec(content)) !== null) {
      targets.push({
        name: match[1],
        productType: match[2]
      });
    }

    // Extract bundle identifier & product name
    let bundleId = null;
    const bundleMatch = content.match(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*"?([^";\s]+)"?;/);
    if (bundleMatch) {
      bundleId = bundleMatch[1];
    }

    let productName = null;
    const prodMatch = content.match(/PRODUCT_NAME\s*=\s*"?([^";]+)"?;/);
    if (prodMatch) {
      productName = prodMatch[1].trim();
    }

    return {
      projectPath,
      targets,
      bundleId,
      productName
    };
  }

  analyze() {
    const structure = this.detectStructure();
    const result = {
      structure,
      workspaces: [],
      projects: []
    };

    for (const ws of structure.workspaces) {
      result.workspaces.push(this.parseWorkspace(ws));
    }

    for (const prj of structure.projects) {
      result.projects.push(this.parseProjectPbx(prj));
    }

    return result;
  }
}

module.exports = WorkspaceParser;
