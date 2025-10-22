// biome-ignore-all lint: This is a dev script that needs console output for progress tracking
import type { Subprocess } from "bun";
import { spawn } from "bun";

const spawnOptions = {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
} as const;

const isPostgresRunning = async (): Promise<boolean> => {
  try {
    const checkProcess = spawn(
      ["docker-compose", "ps", "--services", "--filter", "status=running"],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const output = await new Response(checkProcess.stdout).text();
    await checkProcess.exited;

    return output.includes("postgresdb");
  } catch {
    return false;
  }
};

const run = async () => {
  // Check if PostgreSQL is already running
  const isRunning = await isPostgresRunning();

  if (isRunning) {
    console.log("✅ PostgreSQL database is already running");
  } else {
    console.log("🐘 Starting PostgreSQL database...");
    const dbProcess = spawn(["docker-compose", "up", "-d", "postgresdb"], {
      ...spawnOptions,
    });
    await dbProcess.exited;
    console.log("✅ Database started");
  }

  console.log("🚀 Starting development servers...\n");

  // Run all scripts in parallel
  const processes: Subprocess[] = [
    spawn(["bun", "run", "dev"], { ...spawnOptions, cwd: "./apps/server" }),
    spawn(["bun", "run", "prisma", "studio"], {
      ...spawnOptions,
      cwd: "./apps/server",
    }),
    spawn(["bun", "run", "dev"], { ...spawnOptions, cwd: "./apps/dashboard" }),
    spawn(["bun", "run", "dev"], { ...spawnOptions, cwd: "./packages/emails" }),
  ];

  // Handle cleanup on SIGINT (Ctrl+C)
  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down all processes...");
    for (const proc of processes) {
      proc.kill();
    }
    process.exit(0);
  });

  // Wait for all processes to finish (if needed)
  await Promise.all(processes.map((proc) => proc.exited));
};

run();
