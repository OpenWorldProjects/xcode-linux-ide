#!/usr/bin/env node
const path = require('path');
const service = require('./project-service');
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || ['help', '--help', '-h'].includes(command)) {
    console.log(`Usage: tuxcodebuild inspect <ios-directory|workspace|project>
       tuxcodebuild plan|build|run --workspace PATH --scheme NAME --configuration Debug --destination isim
Options: --project PATH, --env KEY=VALUE, --launch-env KEY=VALUE,
         --setting KEY=VALUE, --launch-arg VALUE
inspect/plan read metadata only. build/run use isim; stock-device compilation is not implemented.`);
    return;
  }
  if (command === 'devices') {
    const raw = await service.execute(path.resolve(__dirname, '../../../bin/ios'), ['list']);
    for (const line of raw.trim().split('\n')) {
      try { for (const udid of JSON.parse(line).deviceList || []) console.log(`[Device] iPhone - UDID: ${udid}`); } catch {}
    }
    return;
  }
  if (command === 'doctor') {
    console.log('TuxCode: project inspection uses Python 3; native builds use isim. Device compilation/signing integration is not implemented.');
    console.log(await service.execute('python3', ['--version']));
    console.log(await service.execute(path.resolve(__dirname, '../../../bin/isim'), ['version']));
    return;
  }
  if (!['inspect', 'plan', 'build', 'run'].includes(command)) throw new Error(`Unsupported command: ${command}. Use --help.`);
  const request = { destination: 'usb', buildEnvironment: {}, launchEnvironment: {}, buildSettings: {} };
  const fields = { '--workspace': 'projectPath', '--project': 'projectPath', '--scheme': 'scheme', '--configuration': 'configuration', '--destination': 'destination' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-') && !request.projectPath) { request.projectPath = arg; continue; }
    const val = args[++i];
    if (val === undefined) throw new Error(`Missing value for ${arg}`);
    if (fields[arg]) request[fields[arg]] = val;
    else if (arg === '--launch-arg') (request.launchArguments ||= []).push(val);
    else if (['--env', '--launch-env', '--setting'].includes(arg)) {
      const split = val.indexOf('=');
      if (split < 1) throw new Error(`${arg} requires KEY=VALUE`);
      request[{ '--env': 'buildEnvironment', '--launch-env': 'launchEnvironment', '--setting': 'buildSettings' }[arg]][val.slice(0, split)] = val.slice(split + 1);
    } else throw new Error(`Unknown option: ${arg}`);
  }
  const result = command === 'inspect' || command === 'plan'
    ? await service.inspect({ ...request, action: command }) : await service[command](request);
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
