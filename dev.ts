import type { SpawnOptions } from "bun";

const spawnOptions: SpawnOptions.OptionsObject = {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
}

const run = async () => {
  // Run all scripts in parallel
  const processes = [
    Bun.spawn(
      ["bun", "run", "dev"],
      {...spawnOptions, cwd: "./apps/server"}
    ),
    Bun.spawn(
      ["bun", "run", "dev"],
      {...spawnOptions, cwd: "./apps/dashboard"}
    ),
    Bun.spawn(
      ["bun", "run", "dev"],
      {...spawnOptions, cwd: "./packages/emails"}
    ),
  ];

  // Handle cleanup on SIGINT
  process.on("SIGINT", async () => {
    console.log("Cleaning up...");
    processes.forEach((process) => process.kill());
    process.exit(0);
  });

  // Wait for all processes to finish (if needed)
  await Promise.all(processes.map((process) => process.exited));
};

run();
