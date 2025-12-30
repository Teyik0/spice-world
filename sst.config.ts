/// <reference path="./.sst/platform/config.d.ts" />

// biome-ignore-all lint/correctness/noUndeclaredVariables: sst specific
// biome-ignore-all lint/suspicious/useAwait: sst specific

export default $config({
  app(input) {
    return {
      name: "spice-world",
      home: "local",
      removal: input?.stage === "production" ? "retain" : "remove",
      providers: {
        neon: { version: "0.9.0", apiKey: process.env.NEON_API_KEY },
        vercel: {
          version: "3.15.1",
          apiToken: process.env.VERCEL_API_TOKEN,
          team: "team_jKy3xXivkDGmI01SAr9Bo9d1",
        },
      },
    };
  },

  async run() {
    const neonProject = new neon.Project("spice-world-db", {
      name: "spice-world-db",
      pgVersion: 17,
      regionId: "aws-us-east-1",
      orgId: "org-crimson-shadow-55928194",
      historyRetentionSeconds: 21_600, // 6 hours (free tier limit)
    });
    const devBranch = new neon.Branch("spice-world-db-dev", {
      projectId: neonProject.id,
      name: "dev",
      parentId: neonProject.defaultBranchId,
    });
    const devEndpoint = new neon.Endpoint("spice-world-db-dev-endpoint", {
      projectId: neonProject.id,
      branchId: devBranch.id,
      type: "read_write",
    });

    const database = new sst.Linkable("Database", {
      properties: {
        prodConnectionString: neonProject.connectionUri,
        devConnectionString: $interpolate`postgresql://${neonProject.databaseUser}:${neonProject.databasePassword}@${devEndpoint.host}/${neonProject.databaseName}?sslmode=require`,
      },
    });

    const serverSecrets = Object.values({
      uploadthingToken: new sst.Secret("UPLOADTHING_TOKEN"),
      betterAuthSecret: new sst.Secret("BETTER_AUTH_SECRET"),
      googleClientId: new sst.Secret("GOOGLE_CLIENT_ID"),
      googleClientSecret: new sst.Secret("GOOGLE_CLIENT_SECRET"),
      resendApiKey: new sst.Secret("RESEND_API_KEY"),
    });

    new vercel.Project("spice-world-server", {
      name: "spice-world-server",
      framework: "elysia",
      rootDirectory: "apps/server",
      buildCommand: "bun run build",
      installCommand: "bun install",
      gitRepository: {
        type: "github",
        repo: "Teyik0/spice-world",
      },
    });

    // Buggy - vercel provider bugs - set once and then commented
    // new vercel.ProjectEnvironmentVariables("spice-world-server-env", {
    //   projectId: spiceWorldServer.id,
    //   variables: [
    //     ...serverSecrets.map((secret) => ({
    //       key: secret.name,
    //       value: secret.value,
    //       targets: ["production", "preview", "development"],
    //     })),
    //     {
    //       key: "DATABASE_URL",
    //       value: database.properties.prodConnectionString,
    //       targets: ["production"],
    //     },
    //     {
    //       key: "DATABASE_URL",
    //       value: database.properties.devConnectionString,
    //       targets: ["preview", "development"],
    //     },
    //   ],
    // });

    // Auto-start dev servers
    new sst.x.DevCommand("Server", {
      dev: {
        autostart: true,
        command: "sst shell bun run dev",
        directory: "apps/server",
        title: "Elysia Server",
      },
    });

    new sst.x.DevCommand("Dashboard", {
      dev: {
        autostart: true,
        command: "sst shell bun run dev",
        directory: "apps/web",
        title: "Next.js Web",
      },
    });

    return {
      database,
      secrets: serverSecrets,
    };
  },
});
