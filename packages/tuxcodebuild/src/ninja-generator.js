const fs = require('fs');
const path = require('path');

class NinjaGenerator {
  constructor(options = {}) {
    const rootDir = path.resolve(__dirname, '../../..');
    this.sysroot = options.sysroot || path.join(rootDir, 'sdk/iPhoneOS.sdk');
    this.target = options.target || 'arm64-apple-ios16.5';
    this.clang = options.clang || path.join(rootDir, 'toolchain/clang');
    this.clangpp = options.clangpp || path.join(rootDir, 'toolchain/clang++');
    this.ld64 = options.ld64 || path.join(rootDir, 'toolchain/ld64.lld');
    this.rcodesign = options.rcodesign || path.join(rootDir, 'bin/rcodesign');
  }

  generate({
    appName,
    bundleId,
    sources = [],
    includeDirs = [],
    defines = [],
    outputDir = 'build',
    infoPlistPath = null
  }) {
    const ninjaLines = [];

    // Variables
    ninjaLines.push(`sysroot = ${this.sysroot}`);
    ninjaLines.push(`target = ${this.target}`);
    ninjaLines.push(`clang = ${this.clang}`);
    ninjaLines.push(`clangpp = ${this.clangpp}`);
    ninjaLines.push(`ld64 = ${this.ld64}`);
    ninjaLines.push(`rcodesign = ${this.rcodesign}`);
    ninjaLines.push(`outdir = ${outputDir}`);
    ninjaLines.push(`appdir = $outdir/Payload/${appName}.app`);
    ninjaLines.push('');

    // Common Flags
    const incFlags = includeDirs.map(d => `-I${d}`).join(' ');
    const defFlags = defines.map(d => `-D${d}`).join(' ');
    ninjaLines.push(`cflags = -target $target -isysroot $sysroot ${incFlags} ${defFlags} -fobjc-arc -O2`);
    ninjaLines.push(`cxxflags = $cflags -std=c++20 -stdlib=libc++`);
    ninjaLines.push(`ldflags = -target $target -isysroot $sysroot -fuse-ld=$ld64 -Wl,-platform_version,ios,16.5.0,16.5 -framework Foundation -framework UIKit -framework CoreGraphics`);
    ninjaLines.push('');

    // Rules
    ninjaLines.push('rule compile_m');
    ninjaLines.push('  command = $clang $cflags -c $in -o $out');
    ninjaLines.push('  description = [Obj-C] $in');
    ninjaLines.push('');

    ninjaLines.push('rule compile_mm');
    ninjaLines.push('  command = $clangpp $cxxflags -c $in -o $out');
    ninjaLines.push('  description = [Obj-C++] $in');
    ninjaLines.push('');

    ninjaLines.push('rule compile_cpp');
    ninjaLines.push('  command = $clangpp $cxxflags -c $in -o $out');
    ninjaLines.push('  description = [C++] $in');
    ninjaLines.push('');

    ninjaLines.push('rule link_app');
    ninjaLines.push('  command = mkdir -p $appdir && $clangpp $ldflags $in -o $appdir/' + appName);
    ninjaLines.push('  description = [LINK] $appdir/' + appName);
    ninjaLines.push('');

    ninjaLines.push('rule copy_plist');
    ninjaLines.push('  command = cp $in $out');
    ninjaLines.push('  description = [PLIST] $out');
    ninjaLines.push('');

    ninjaLines.push('rule sign_app');
    ninjaLines.push('  command = $rcodesign sign $appdir && touch $out');
    ninjaLines.push('  description = [SIGN] $appdir');
    ninjaLines.push('');

    // Object outputs
    const objectFiles = [];
    for (const src of sources) {
      const ext = path.extname(src);
      const base = path.basename(src, ext);
      const objFile = `$outdir/obj/${base}.o`;
      objectFiles.push(objFile);

      let rule = 'compile_m';
      if (ext === '.mm') rule = 'compile_mm';
      else if (ext === '.cpp' || ext === '.cc') rule = 'compile_cpp';

      ninjaLines.push(`build ${objFile}: ${rule} ${src}`);
    }

    const appBinary = `$appdir/${appName}`;
    ninjaLines.push('');
    ninjaLines.push(`build ${appBinary}: link_app ${objectFiles.join(' ')}`);

    const targetsToWait = [appBinary];

    if (infoPlistPath) {
      const targetPlist = `$appdir/Info.plist`;
      ninjaLines.push(`build ${targetPlist}: copy_plist ${infoPlistPath}`);
      targetsToWait.push(targetPlist);
    }

    ninjaLines.push(`build $outdir/.signed: sign_app | ${targetsToWait.join(' ')}`);
    ninjaLines.push('');
    ninjaLines.push('default $outdir/.signed');
    ninjaLines.push('');

    return ninjaLines.join('\n') + '\n';
  }
}

module.exports = NinjaGenerator;
