import { spawnSync } from 'node:child_process';
import { delimiter, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL(
  '../node_modules/@astryxdesign/cli/clients/cli/bin/astryx.mjs',
  import.meta.url,
));

if (process.platform === 'win32') {
  // npm adds a project shim that Astryx 0.7.17 mistakes for a different CLI.
  // Doctor runs the installed entry point and can still inspect the computer's PATH.
  const projectBin = fileURLToPath(new URL('../node_modules/.bin', import.meta.url)).toLowerCase();
  process.env.Path = (process.env.Path ?? '')
    .split(delimiter)
    .filter((directory) => resolve(directory).toLowerCase() !== projectBin)
    .join(delimiter);
}

const result = spawnSync(process.execPath, [cli, 'doctor', '--built', '.next'], {
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
