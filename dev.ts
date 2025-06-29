import type { SpawnOptions } from 'bun';
import { spawn } from 'bun';

const spawnOptions: SpawnOptions.Writable = {
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
};

const run = async () => {
  // Run all scripts in parallel
  const processes = [
    spawn(['bun', 'run', 'dev'], { ...spawnOptions, cwd: './apps/server' }),
    spawn(['bun', 'run', 'prisma', 'studio'], {
      ...spawnOptions,
      cwd: './apps/server',
    }),
    spawn(['bun', 'run', 'dev'], { ...spawnOptions, cwd: './apps/dashboard' }),
    spawn(['bun', 'run', 'dev'], { ...spawnOptions, cwd: './packages/emails' }),
  ];

  // Handle cleanup on SIGINT
  process.on('SIGINT', () => {
    for (const process of processes) {
      process.kill();
    }
    process.exit(0);
  });

  // Wait for all processes to finish (if needed)
  await Promise.all(processes.map((process) => process.exited));
};

run();
