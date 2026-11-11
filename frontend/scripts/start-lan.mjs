import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The API address is already the Windows LAN address reachable from the phone.
try {
  process.loadEnvFile(join(projectDir, '.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
let hostname;
try {
  hostname = new URL(process.env.EXPO_PUBLIC_API_URL).hostname;
} catch {
  throw new Error('Set EXPO_PUBLIC_API_URL in .env to your computer’s LAN API URL first.');
}
if (['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2', '[::1]'].includes(hostname)) {
  throw new Error('Phone LAN mode needs your computer’s LAN IP in EXPO_PUBLIC_API_URL, not localhost or an emulator address.');
}
const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('expo/package.json')), 'bin', 'cli');
console.log(`Expo will advertise ${hostname}; your phone must also be able to reach the Expo port (8081 by default).`);
const extraArgs = process.argv.slice(2);
// SDK 58 treats --offline as a hosting mode, so it cannot be combined with --lan.
const hostArgs = extraArgs.includes('--offline') ? [] : ['--lan'];
const child = spawn(process.execPath, [cli, 'start', ...hostArgs, '--clear', ...extraArgs], {
  cwd: projectDir,
  stdio: 'inherit',
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: hostname },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
