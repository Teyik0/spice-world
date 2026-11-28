import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";

import { treaty } from "@elysia/eden";
import { ordersRouter } from "@spice-world/server/modules/orders";
import {
  auth,
  betterAuthPlugin,
} from "@spice-world/server/plugins/auth.plugin";
import Elysia from "elysia";

import { testDb } from "./setup";
import {
  createTestOrder,
  expectDefined,
  mockStripe,
  verifyEmail,
} from "./utils/helper";

describe.concurrent("BetterAuth Plugin Tests", () => {
  let adminUser: Awaited<ReturnType<typeof auth.api.createUser>>;
  let normalUser: Awaited<ReturnType<typeof auth.api.createUser>>;
  let stripe: Awaited<ReturnType<typeof mockStripe>>;

  beforeAll(async () => {
    expect(Bun.env.NODE_ENV).not.toBe("production");
    expect(Bun.env.DATABASE_URL).toBeTruthy();
    stripe = await mockStripe();

    [normalUser, adminUser] = await Promise.all([
      auth.api.createUser({
        body: {
          email: "user@example.com",
          password: "password",
          name: "John Doe",
          role: "user",
        },
      }),
      auth.api.createUser({
        body: {
          email: "admin@example.com",
          password: "password",
          name: "Admin Doe",
          role: "admin",
        },
      }),
    ]);
    await Promise.all([
      verifyEmail(testDb, normalUser.user.id),
      verifyEmail(testDb, adminUser.user.id),
    ]);
  });

  afterAll(() => {
    stripe.restore();
  });

  describe("Initialization", () => {
    test("should initialize betterAuth with correct configuration", () => {
      expect(auth).toBeDefined();
      expect(auth.api).toBeDefined();
      expect(auth.handler).toBeDefined();
    });
  });

  describe("Email Sending", () => {
    test("should send reset password email correctly", async () => {
      const sendEmailMock = spyOn(
        auth.options.emailAndPassword,
        "sendResetPassword",
      );

      await auth.options.emailAndPassword.sendResetPassword({
        user: normalUser.user,
        url: "http://example.com/reset-password",
        token: "token",
      });

      expect(sendEmailMock).toHaveBeenCalledWith({
        user: normalUser.user,
        url: "http://example.com/reset-password",
        token: "token",
      });
    });

    test("should send verification email correctly", async () => {
      const sendEmailMock = spyOn(
        auth.options.emailVerification,
        "sendVerificationEmail",
      );

      await auth.options.emailVerification.sendVerificationEmail({
        user: normalUser.user,
        url: "http://example.com/reset-password",
        token: "token",
      });

      expect(sendEmailMock).toHaveBeenCalledWith({
        user: normalUser.user,
        url: "http://example.com/reset-password",
        token: "token",
      });
    });

    test("should send change email confirmation correctly", async () => {
      const sendEmailMock = spyOn(
        auth.options.user.changeEmail,
        "sendChangeEmailConfirmation",
      );

      await auth.options.user.changeEmail.sendChangeEmailConfirmation({
        user: adminUser.user,
        newEmail: "newEmail@example.com",
        token: "token",
        url: "http://example.com/change-email",
      });

      expect(sendEmailMock).toHaveBeenCalledWith({
        user: adminUser.user,
        newEmail: "newEmail@example.com",
        url: "http://example.com/change-email",
        token: "token",
      });
    });

    test("should send password reset correctly", async () => {
      const sendEmailMock = spyOn(
        auth.options.emailAndPassword,
        "onPasswordReset",
      );

      await auth.options.emailAndPassword.onPasswordReset({
        user: adminUser.user,
      });

      expect(sendEmailMock).toHaveBeenCalledWith({
        user: adminUser.user,
      });
    });
  });

  describe("Drizzle adapter", () => {
    test("stores, reads and deletes sessions joined with their user", async () => {
      const { headers } = await auth.api.signInEmail({
        body: { email: normalUser.user.email, password: "password" },
        returnHeaders: true,
      });
      const cookie = headers.get("set-cookie")?.split(";")[0] ?? "";
      // Only the session cookie: no cookie cache, the session is read from the database
      const session = await auth.api.getSession({
        headers: new Headers({ cookie }),
      });
      expectDefined(session);
      expect(session.user.id).toBe(normalUser.user.id);
      expect(session.session.expiresAt.getTime()).toBeGreaterThan(Date.now());

      await auth.api.signOut({ headers: new Headers({ cookie }) });
      expect(
        await auth.api.getSession({ headers: new Headers({ cookie }) }),
      ).toBeNull();
    });

    test("stores and reads verifications", async () => {
      const { internalAdapter } = await auth.$context;
      const identifier = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60_000);
      await internalAdapter.createVerificationValue({
        identifier,
        value: "token",
        expiresAt,
      });
      expect(
        await internalAdapter.findVerificationValue(identifier),
      ).toMatchObject({ identifier, value: "token", expiresAt });
    });

    test("rejects a duplicate email", () => {
      expect(
        auth.api.createUser({
          body: {
            email: normalUser.user.email,
            password: "password",
            name: "Duplicate",
          },
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe("Macros testing", () => {
    const app = new Elysia()
      .use(betterAuthPlugin)
      .get("/", { access: "optional" }, async ({ user }) => user)
      .get("/admin", { access: "admin" }, async ({ user }) => user)
      .get("/login", { access: "login" }, async ({ user }) => user);
    let api: ReturnType<typeof treaty<typeof app>>;
    let normalUserCookie: string;
    let adminUserCookie: string;

    beforeAll(async () => {
      api = treaty(app);
      const [normalUserResp, adminUserResp] = await Promise.all([
        auth.api.signInEmail({
          body: {
            email: normalUser.user.email,
            password: "password",
          },
          returnHeaders: true,
        }),
        auth.api.signInEmail({
          body: {
            email: adminUser.user.email,
            password: "password",
          },
          returnHeaders: true,
        }),
      ]);

      const normalUserSetCookie = normalUserResp.headers.get("set-cookie");
      normalUserCookie = normalUserSetCookie?.split(";")[0] || "";

      const adminUserSetCookie = adminUserResp.headers.get("set-cookie");
      adminUserCookie = adminUserSetCookie?.split(";")[0] || "";
    });

    test("should allow optional access without authentication", async () => {
      const response = await app.handle(new Request("http://localhost/"));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("");
    });

    test("should allow optional access with an authenticated user", async () => {
      const { data, status } = await api.get({
        headers: {
          cookie: normalUserCookie,
        },
      });

      expectDefined(data);
      expect(data.email).toBe(normalUser.user.email);
      expect(status).toBe(200);
    });

    test("should test login access with authenticated user", async () => {
      const { data, status } = await api.login.get({
        headers: {
          cookie: normalUserCookie,
        },
      });

      expectDefined(data);
      expect(data.email).toBe(normalUser.user.email);
      expect(status).toBe(200);
    });

    test("should test login access without authentication", async () => {
      const { error, status } = await api.login.get();

      expect(error).toMatchObject({ status: 401 });
      expect(status).toBe(401);
    });

    test("should test admin access with admin user", async () => {
      const { data, status } = await api.admin.get({
        headers: {
          cookie: adminUserCookie,
        },
      });

      expectDefined(data);
      expect(data.email).toBe(adminUser.user.email);
      expect(data.role).toBe("admin");
      expect(status).toBe(200);
    });

    test("should test admin access with normal user (should fail)", async () => {
      const { error, status } = await api.admin.get({
        headers: {
          cookie: normalUserCookie,
        },
      });

      expect(error).toMatchObject({
        status: 403,
        value: { title: "Forbidden" },
      });
      expect(status).toBe(403);
    });

    test("should test admin access without authentication", async () => {
      const { error, status } = await api.admin.get();

      expect(error).toMatchObject({ status: 401 });
      expect(status).toBe(401);
    });
  });

  describe("Admin Routes Access Control", () => {
    let ordersApi: ReturnType<typeof treaty<typeof ordersRouter>>;
    let normalUserCookie: string;
    let adminUserCookie: string;

    beforeAll(async () => {
      ordersApi = treaty(ordersRouter);

      const [normalUserResp, adminUserResp] = await Promise.all([
        auth.api.signInEmail({
          body: {
            email: normalUser.user.email,
            password: "password",
          },
          returnHeaders: true,
        }),
        auth.api.signInEmail({
          body: {
            email: adminUser.user.email,
            password: "password",
          },
          returnHeaders: true,
        }),
      ]);

      const normalUserSetCookie = normalUserResp.headers.get("set-cookie");
      normalUserCookie = normalUserSetCookie?.split(";")[0] || "";

      const adminUserSetCookie = adminUserResp.headers.get("set-cookie");
      adminUserCookie = adminUserSetCookie?.split(";")[0] || "";
    });

    describe("Orders Admin Access", () => {
      test("admin can update order status", async () => {
        const order = await createTestOrder(testDb, normalUser.user.id, "PAID");

        // Admin can update order status
        const { data, status } = await ordersApi.orders["by-id"]({
          id: order.id,
        }).status.patch(
          {
            status: "FULFILLED",
            trackingNumber: "TRACK123",
          },
          {
            headers: {
              cookie: adminUserCookie,
            },
          },
        );

        expect(status).toBe(200);
        expect(data).toMatchObject({
          id: order.id,
          status: "FULFILLED",
          trackingNumber: "TRACK123",
          shippingStatus: "SHIPPED",
          user: { id: normalUser.user.id, email: normalUser.user.email },
          items: [{ quantity: 1 }],
        });
      });

      test("normal user cannot update order status", async () => {
        const order = await createTestOrder(testDb, normalUser.user.id);

        // Normal user cannot update order status
        const { data, status } = await ordersApi.orders["by-id"]({
          id: order.id,
        }).status.patch(
          {
            status: "PAID",
          },
          {
            headers: {
              cookie: normalUserCookie,
            },
          },
        );

        expect(data).toBeNull();
        expect(status).toBe(403);
      });

      test("admin can view all orders", async () => {
        await Promise.all([
          createTestOrder(testDb, normalUser.user.id),
          createTestOrder(testDb, adminUser.user.id, "PAID"),
        ]);

        // Admin can see all orders
        const { data, status } = await ordersApi.orders.get({
          query: {
            page: 1,
            limit: 10,
          },
          headers: {
            cookie: adminUserCookie,
          },
        });

        expectDefined(data);
        expect(data.items.length).toBeGreaterThanOrEqual(2);
        expect(status).toBe(200);
      });

      test("normal user can only view their own orders", async () => {
        await Promise.all([
          createTestOrder(testDb, normalUser.user.id),
          createTestOrder(testDb, adminUser.user.id),
        ]);
        const { data, status } = await ordersApi.orders.get({
          query: {
            page: 1,
            limit: 10,
          },
          headers: {
            cookie: normalUserCookie,
          },
        });

        expectDefined(data);
        expect(status).toBe(200);
        expect(data.items.length).toBeGreaterThanOrEqual(1);
        for (const order of data.items) {
          expect(order.userId).toBe(normalUser.user.id);
        }
      });

      test("unauthenticated user cannot access orders", async () => {
        const { data, status } = await ordersApi.orders.get({
          query: {
            page: 1,
            limit: 10,
          },
        });

        expect(data).toBeNull();
        expect(status).toBe(401);
      });
    });
  });
});
