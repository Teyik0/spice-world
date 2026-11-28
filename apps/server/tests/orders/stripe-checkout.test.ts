import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";

import { treaty } from "@elysia/eden";
import { ordersRouter } from "@spice-world/server/modules/orders";
import { productsRouter } from "@spice-world/server/modules/products";
import * as stripeCheckoutModule from "@spice-world/server/modules/stripe-checkout";
import { auth } from "@spice-world/server/plugins/auth.plugin";

import { testDb } from "../setup";
import {
  createSessionCookie,
  createSetupProduct,
  expectDefined,
  expectNoDrift,
  file,
  mockUtapi,
  verifyEmail,
} from "../utils/helper";

const filePath1 = `${import.meta.dir}/../public/cumin.webp`;

await mockUtapi();
const productsApi = treaty(productsRouter, {
  headers: { cookie: await createSessionCookie(testDb) },
});
const ordersApi = treaty(ordersRouter);

describe("Stripe Checkout", () => {
  let userCookie: string;
  let createStripeCheckoutMock: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    // Mock Stripe Checkout function
    createStripeCheckoutMock = spyOn(
      stripeCheckoutModule,
      "createStripeCheckout",
    ).mockImplementation(() => {
      const mockSessionId = `mock_checkout_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      return Promise.resolve({
        id: mockSessionId,
        url: `https://mock-stripe.checkout.url/${mockSessionId}`,
        status: "open" as const,
      });
    });

    // Create test user for authenticated requests
    const testUser = await auth.api.createUser({
      body: {
        email: "stripe-test@spiceworld.test",
        password: "password123",
        name: "Stripe Test User",
        role: "user",
      },
    });
    await verifyEmail(testDb, testUser.user.id);

    // Sign in to get cookie
    const signInResp = await auth.api.signInEmail({
      body: {
        email: "stripe-test@spiceworld.test",
        password: "password123",
      },
      returnHeaders: true,
    });
    const setCookie = signInResp.headers.get("set-cookie");
    userCookie = setCookie?.split(";")[0] || "";
  });

  afterAll(() => {
    // Restore Stripe Checkout mock if it was created
    createStripeCheckoutMock?.mockRestore();
  });

  describe("POST /orders/checkout", () => {
    it("should succeed checkout validation without polarProductId requirement", async () => {
      const setupProduct = createSetupProduct(testDb, productsApi);

      // With Stripe, no product sync is needed
      const { product } = await setupProduct({
        attributeCount: 1,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "NO-SYNC-NEEDED-001",
            inventory: { quantity: 5 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const [variant] = product.variants;
      expectDefined(variant);
      const { status: published } = await productsApi
        .products({ id: product.id })
        .patch(
          { status: "PUBLISHED" },
          { headers: { "x-version": product.version } },
        );
      expect(published).toBe(200);

      // With Stripe, checkout should work without polarProductId
      // Validation should pass (checkout flow uses inline Stripe checkout)
      const { status } = await ordersApi.orders.checkout.post(
        {
          items: [
            {
              variantId: variant.id,
              quantity: 1,
            },
          ],
          shippingAddress: {
            name: "Test User",
            line1: "123 Test Street",
            city: "Test City",
            postalCode: "12345",
            country: "FR",
          },
        },
        {
          headers: {
            cookie: userCookie,
          },
        },
      );

      // Should pass validation with Stripe (no polarProductId requirement)
      expect(status).toBe(201);
    });

    it("should create checkout session with Stripe", async () => {
      const setupProduct = createSetupProduct(testDb, productsApi);

      // Create a product
      const { product } = await setupProduct({
        attributeCount: 1,
        attributeValueCount: 2,
        variants: [
          {
            price: 1000,
            sku: "STRIPE-TEST-001",
            inventory: { quantity: 5 },
            attributeValueIds: [],
          },
        ],
        imagesCreate: [{ position: 0, file: file(filePath1) }],
      });

      const [variant] = product.variants;
      expectDefined(variant);
      const { status: published } = await productsApi
        .products({ id: product.id })
        .patch(
          { status: "PUBLISHED" },
          { headers: { "x-version": product.version } },
        );
      expect(published).toBe(200);

      // Checkout should create a Stripe session
      const { data, status } = await ordersApi.orders.checkout.post(
        {
          items: [
            {
              variantId: variant.id,
              quantity: 1,
            },
          ],
          shippingAddress: {
            name: "Test User",
            line1: "123 Test Street",
            city: "Test City",
            postalCode: "12345",
            country: "FR",
          },
        },
        {
          headers: {
            cookie: userCookie,
          },
        },
      );

      expect(status).toBe(201);
      expectDefined(data);
      expect(data).toHaveProperty("checkoutUrl");
      expect(data).toMatchObject({
        checkoutUrl: expect.stringContaining("mock-stripe.checkout.url"),
      });
      expect(data).toHaveProperty("order");
    });
  });
});

afterAll(() => expectNoDrift(testDb));
