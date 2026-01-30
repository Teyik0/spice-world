import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import * as imagesModule from "@spice-world/server/lib/images";
import { prisma } from "@spice-world/server/lib/prisma";
import type { categoryRouter } from "@spice-world/server/modules/categories";
import { createTestDatabase } from "@spice-world/server/utils/db-manager";
import {
	createUploadedFileData,
	expectDefined,
} from "@spice-world/server/utils/helper";
import type { BunFile } from "bun";
import { file } from "bun";

describe.concurrent("Category routes test", () => {
	let testDb: Awaited<ReturnType<typeof createTestDatabase>>;
	let api: ReturnType<typeof treaty<typeof categoryRouter>>;

	beforeAll(async () => {
		if (Bun.env.NODE_ENV === "production") {
			throw new Error("You can't run tests in production");
		}
		if (!Bun.env.DATABASE_URL) {
			throw new Error("DATABASE_URL should be set");
		}
		testDb = await createTestDatabase("category.test.ts");

		spyOn(imagesModule.utapi, "uploadFiles").mockImplementation((async (
			files,
		) => {
			return {
				data: createUploadedFileData(files as File),
				error: null,
			};
		}) as typeof imagesModule.utapi.uploadFiles);

		const { categoryRouter } = await import(
			"@spice-world/server/modules/categories"
		);
		api = treaty(categoryRouter);
	});

	afterAll(async () => {
		await testDb.destroy();
	});

	const postCategory = async (name: string, bunfile: BunFile) => {
		const data = await api.categories.post({
			name,
			file: bunfile,
		});
		return data;
	};

	describe("Create new category - POST/", () => {
		test("should create a new category without attributes", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const name = "test category";
			const { data, status } = await postCategory(name, bunfile);

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe(name);
			expect(data.image).toMatchObject({
				id: expect.any(String),
				keyThumb: expect.any(String),
				keyMedium: expect.any(String),
				keyLarge: expect.any(String),
				urlThumb: expect.any(String),
				urlMedium: expect.any(String),
				urlLarge: expect.any(String),
				altText: expect.any(String),
				isThumbnail: true,
			});
			expect(data.attributes).toEqual([]);
		});

		test("should create a new category with accent", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const name = "épices";
			const { data, status } = await postCategory(name, bunfile);

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe(name);
			expect(data.image).toMatchObject({
				id: expect.any(String),
				keyThumb: expect.any(String),
				keyMedium: expect.any(String),
				keyLarge: expect.any(String),
				urlThumb: expect.any(String),
				urlMedium: expect.any(String),
				urlLarge: expect.any(String),
				altText: expect.any(String),
				isThumbnail: true,
			});
		});

		test("should error if name is already taken", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const category = await postCategory("other category", bunfile);
			expectDefined(category.data);
			expect(category.status).toBe(201);

			const { error, status } = await postCategory("other category", bunfile);

			expect(status).toBe(409);
			expectDefined(error);
		});

		test("should error if name start with a uppercase letter", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { error, status } = await api.categories.post({
				file: bunfile,
				name: "Hello",
			});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should error if name don't contain only letters and spaces - (1)", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { error, status } = await api.categories.post({
				name: "hello world!",
				file: bunfile,
			});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should error if name don't contain only letters and spaces - (2)", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { error, status } = await api.categories.post({
				file: bunfile,
				name: "hello 5",
			});

			expect(status).toBe(422);
			expect(error).not.toBeNull();
			expect(error).not.toBeUndefined();
		});

		test("should create a new category with single attribute", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const name = "vêtements";
			const { data, status } = await api.categories.post({
				name,
				file: bunfile,
				attributes: {
					create: [
						{
							name: "taille",
							values: ["small", "medium", "large"],
						},
					],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe(name);
			expect(data.attributes).toHaveLength(1);
			expect(data.attributes[0]).toHaveProperty("id");
			expect(data.attributes[0]).toHaveProperty("name", "taille");
			expect(data.attributes[0]).toHaveProperty("categoryId", data.id);
			expect(data.attributes[0]?.values).toHaveLength(3);
			expect(data.attributes[0]?.values[0]).toHaveProperty("value", "small");
			expect(data.attributes[0]?.values[1]).toHaveProperty("value", "medium");
			expect(data.attributes[0]?.values[2]).toHaveProperty("value", "large");
		});

		test("should create a new category with multiple attributes", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const name = "spices category";
			const { data, status } = await api.categories.post({
				name,
				file: bunfile,
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir", "blanc", "rouge"],
						},
						{
							name: "poids",
							values: [
								"cent grammes",
								"deux cent cinquante grammes",
								"cinq cents grammes",
							],
						},
						{
							name: "origine",
							values: ["france", "inde", "maroc"],
						},
					],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.name).toBe(name);
			expect(data.attributes).toHaveLength(3);

			// Check first attribute
			expect(data.attributes[0]).toHaveProperty("name", "couleur");
			expect(data.attributes[0]?.values).toHaveLength(3);
			expect(data.attributes[0]?.values.map((v) => v.value)).toEqual([
				"noir",
				"blanc",
				"rouge",
			]);

			// Check second attribute
			expect(data.attributes[1]).toHaveProperty("name", "poids");
			expect(data.attributes[1]?.values).toHaveLength(3);
			expect(data.attributes[1]?.values.map((v) => v.value)).toEqual([
				"cent grammes",
				"deux cent cinquante grammes",
				"cinq cents grammes",
			]);

			// Check third attribute
			expect(data.attributes[2]).toHaveProperty("name", "origine");
			expect(data.attributes[2]?.values).toHaveLength(3);
			expect(data.attributes[2]?.values.map((v) => v.value)).toEqual([
				"france",
				"inde",
				"maroc",
			]);
		});

		test("should error if attribute name is invalid (uppercase)", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { error, status } = await api.categories.post({
				name: "invalid attr category",
				file: bunfile,
				attributes: {
					create: [
						{
							name: "Couleur", // invalid uppercase letter
							values: ["noir"],
						},
					],
				},
			});

			expect(status).toBe(422);
			expectDefined(error);
		});

		test("should error if attribute has no values", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { error, status } = await api.categories.post({
				name: "empty values category",
				file: bunfile,
				attributes: {
					create: [
						{
							name: "couleur",
							values: [],
						},
					],
				},
			});

			expect(status).toBe(422);
			expectDefined(error);
		});

		test("should accept attribute values with numbers", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);

			const { data, status } = await api.categories.post({
				name: "value with numbers category",
				file: bunfile,
				attributes: {
					create: [
						{
							name: "modèle",
							values: ["iphone 15", "galaxy s24", "pixel 8"],
						},
					],
				},
			});

			expect(status).toBe(201);
			expectDefined(data);
			expect(data.attributes).toHaveLength(1);
			expect(data.attributes[0]?.values).toHaveLength(3);
			expect(data.attributes[0]?.values.map((v) => v.value)).toContain(
				"iphone 15",
			);
		});
	});

	describe("Get existing categories - GET/ & GET/:id", () => {
		test("should return one category", async () => {
			// First, create a category using postCategory
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const bunfile = file(filePath);
			const name = "test category for get";
			const { data: createdCategory, status: postStatus } = await postCategory(
				name,
				bunfile,
			);

			expect(postStatus).toBe(201);
			expectDefined(createdCategory);

			// Now, get the category by its id
			const { data, status } = await api
				.categories({ id: createdCategory.id })
				.get();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id", createdCategory.id);
			expect(data).toHaveProperty("name", createdCategory.name);
			expect(data).toHaveProperty("imageId");
		});
	});

	describe("Delete category - DELETE/:id", () => {
		test("should post and delete category", async () => {
			const filePath = `${import.meta.dir}/public/cumin.webp`;
			const { data: oldCategory, status: oldStatus } =
				await api.categories.post({
					name: "hello category",
					file: file(filePath),
				});

			expect(oldStatus).toBe(201);
			expectDefined(oldCategory);
			expect(oldCategory).toHaveProperty("id");
			expect(oldCategory).toHaveProperty("name", "hello category");
			expect(oldCategory).toHaveProperty("image");

			const { data, status } = await api
				.categories({ id: oldCategory.id })
				.delete();

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toBe("OK");

			// Check image is well deleted
			const image = await prisma.image.findUnique({
				where: { id: oldCategory.image?.id },
			});
			expect(image).toBe(null);
		});
	});

	describe("Update category - PATCH/:id", () => {
		test("should update category with new name only", async () => {
			const category = await postCategory(
				"initial category",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
			expectDefined(category.data);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: "updated category",
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data).toHaveProperty("name", "updated category");
		});

		test("should update category with new file only", async () => {
			const category = await postCategory(
				"categoryuno",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
			expectDefined(category.data);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					file: file(`${import.meta.dir}/public/garlic.webp`),
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data.name).toBe(category.data.name);
			expect(data.image).not.toBe(category.data.image);
		});

		test("should update category with new file and new name", async () => {
			const category = await postCategory(
				"categorydos",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
			expectDefined(category.data);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: "new category",
					file: file(`${import.meta.dir}/public/cumin.webp`),
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data).toHaveProperty("id");
			expect(data).toHaveProperty("name", "new category");
			expect(data.image).not.toBe(category.data.image);
		});

		test("should update category with new attribute", async () => {
			const category = await postCategory(
				"category for attribute",
				file(`${import.meta.dir}/public/cumin.webp`),
			);
			expectDefined(category.data);
			expect(category.data.attributes).toEqual([]);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						create: [
							{
								name: "couleur",
								values: ["noir", "blanc"],
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.attributes).toHaveLength(1);
			expect(data.attributes[0]).toHaveProperty("name", "couleur");
			expect(data.attributes[0]?.values).toHaveLength(2);
			expect(data.attributes[0]?.values[0]).toHaveProperty("value", "noir");
			expect(data.attributes[0]?.values[1]).toHaveProperty("value", "blanc");
		});

		test("should update category with multiple attribute operations", async () => {
			const category = await api.categories.post({
				name: "multi ops category",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir"],
						},
						{
							name: "taille",
							values: ["small"],
						},
						{
							name: "poids",
							values: ["cent grammes"],
						},
					],
				},
			});

			expectDefined(category.data);
			expect(category.data.attributes).toHaveLength(3);

			const attributeToUpdate = category.data.attributes.find(
				(a) => a.name === "couleur",
			);
			const attributeToDelete = category.data.attributes.find(
				(a) => a.name === "poids",
			);
			expectDefined(attributeToUpdate);
			expectDefined(attributeToDelete);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						create: [
							{
								name: "origine",
								values: ["france", "inde"],
							},
						],
						update: [
							{
								id: attributeToUpdate.id,
								name: "color",
							},
						],
						delete: [attributeToDelete.id],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.attributes).toHaveLength(3);

			const updatedAttr = data.attributes.find(
				(a: { id: string }) => a.id === attributeToUpdate.id,
			);
			const createdAttr = data.attributes.find(
				(a: { name: string }) => a.name === "origine",
			);
			const deletedAttr = data.attributes.find(
				(a: { id: string }) => a.id === attributeToDelete.id,
			);

			expectDefined(updatedAttr);
			expect(updatedAttr.name).toBe("color");
			expectDefined(createdAttr);
			expect(createdAttr.values).toHaveLength(2);
			expect(deletedAttr).toBeUndefined();
		});

		test("should update attribute name only", async () => {
			const category = await api.categories.post({
				name: "update name category",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir", "blanc", "rouge"],
						},
					],
				},
			});

			expectDefined(category.data);
			const attributeId = category.data.attributes[0]?.id;
			expectDefined(attributeId);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						update: [
							{
								id: attributeId,
								name: "color",
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.attributes).toHaveLength(1);
			expect(data.attributes[0]).toHaveProperty("name", "color");
			expect(data.attributes[0]?.values).toHaveLength(3);
		});

		test("should delete attribute and cascade delete values", async () => {
			const category = await api.categories.post({
				name: "delete attr category",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir", "blanc"],
						},
						{
							name: "taille",
							values: ["small", "medium"],
						},
					],
				},
			});

			expectDefined(category.data);
			expect(category.data.attributes).toHaveLength(2);
			const attributeToDelete = category.data.attributes[0];
			expectDefined(attributeToDelete);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						delete: [attributeToDelete.id],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.attributes).toHaveLength(1);
			expect(
				data.attributes.find(
					(a: { id: string }) => a.id === attributeToDelete.id,
				),
			).toBeUndefined();
		});

		test("should error if creating attribute with duplicate name", async () => {
			const category = await api.categories.post({
				name: "duplicate create category",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir"],
						},
					],
				},
			});

			expectDefined(category.data);

			const { error, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						create: [
							{
								name: "couleur",
								values: ["blanc"],
							},
						],
					},
				});

			expect(status).toBe(409);
			expectDefined(error);
		});

		test("should error if updating attribute to duplicate name", async () => {
			const category = await api.categories.post({
				name: "duplicate update category",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir"],
						},
						{
							name: "taille",
							values: ["small"],
						},
					],
				},
			});

			expectDefined(category.data);
			const tailleAttribute = category.data.attributes.find(
				(a) => a.name === "taille",
			);
			expectDefined(tailleAttribute);

			const { error, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						update: [
							{
								id: tailleAttribute.id,
								name: "couleur",
							},
						],
					},
				});

			expect(status).toBe(409);
			expectDefined(error);
		});

		test("should update category name and attributes together", async () => {
			const category = await api.categories.post({
				name: "combined update category",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir"],
						},
					],
				},
			});

			expectDefined(category.data);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: "renamed category",
					attributes: {
						create: [
							{
								name: "taille",
								values: ["small", "large"],
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.name).toBe("renamed category");
			expect(data.attributes).toHaveLength(2);
		});
	});

	describe("Update attribute values - PATCH/:id", () => {
		test("should create new attribute values", async () => {
			const category = await api.categories.post({
				name: "category with values",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir", "blanc"],
						},
					],
				},
			});

			expectDefined(category.data);
			const attributeId = category.data.attributes[0]?.id;
			expectDefined(attributeId);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						update: [
							{
								id: attributeId,
								values: {
									create: ["rouge", "vert"],
								},
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.attributes).toHaveLength(1);
			expect(data.attributes[0]?.values).toHaveLength(4);
			expect(data.attributes[0]?.values.map((v) => v.value).sort()).toEqual([
				"blanc",
				"noir",
				"rouge",
				"vert",
			]);
		});

		test("should delete attribute values", async () => {
			const category = await api.categories.post({
				name: "category for deletion",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "taille",
							values: ["small", "medium", "large"],
						},
					],
				},
			});

			expectDefined(category.data);
			const attribute = category.data.attributes[0];
			expectDefined(attribute);
			const valueToDelete = attribute.values.find((v) => v.value === "medium");
			expectDefined(valueToDelete);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						update: [
							{
								id: attribute.id,
								values: {
									delete: [valueToDelete.id],
								},
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.attributes[0]?.values).toHaveLength(2);
			expect(data.attributes[0]?.values.map((v) => v.value).sort()).toEqual([
				"large",
				"small",
			]);
		});

		test("should create and delete values in same operation", async () => {
			const category = await api.categories.post({
				name: "category for combined ops",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir", "blanc", "gris"],
						},
					],
				},
			});

			expectDefined(category.data);
			const attribute = category.data.attributes[0];
			expectDefined(attribute);
			const valueToDelete = attribute.values.find((v) => v.value === "gris");
			expectDefined(valueToDelete);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						update: [
							{
								id: attribute.id,
								values: {
									create: ["rouge", "bleu"],
									delete: [valueToDelete.id],
								},
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.attributes[0]?.values).toHaveLength(4);
			expect(data.attributes[0]?.values.map((v) => v.value).sort()).toEqual([
				"blanc",
				"bleu",
				"noir",
				"rouge",
			]);
		});

		test("should fail when creating duplicate value", async () => {
			const category = await api.categories.post({
				name: "category duplicate test",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir", "blanc"],
						},
					],
				},
			});

			expectDefined(category.data);
			const attributeId = category.data.attributes[0]?.id;
			expectDefined(attributeId);

			const { status, error } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						update: [
							{
								id: attributeId,
								values: {
									create: ["noir"], // Already exists
								},
							},
						],
					},
				});

			expect(status).toBe(409);
			expectDefined(error);
			expect(error.value).toContain("already has values");
		});

		test("should fail when deleting non-existent value ID", async () => {
			const category = await api.categories.post({
				name: "category invalid id test",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir"],
						},
					],
				},
			});

			expectDefined(category.data);
			const attributeId = category.data.attributes[0]?.id;
			expectDefined(attributeId);

			const { status, error } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						update: [
							{
								id: attributeId,
								values: {
									delete: ["00000000-0000-0000-0000-000000000000"],
								},
							},
						],
					},
				});

			expect(status).toBe(404);
			expectDefined(error);
			expect(error.value).toContain("Value IDs not found");
		});

		test("should update attribute name and values together", async () => {
			const category = await api.categories.post({
				name: "category combined update",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "couleur",
							values: ["noir", "blanc"],
						},
					],
				},
			});

			expectDefined(category.data);
			const attribute = category.data.attributes[0];
			expectDefined(attribute);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						update: [
							{
								id: attribute.id,
								name: "color",
								values: {
									create: ["rouge"],
								},
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.attributes[0]?.name).toBe("color");
			expect(data.attributes[0]?.values).toHaveLength(3);
			expect(data.attributes[0]?.values.map((v) => v.value).sort()).toEqual([
				"blanc",
				"noir",
				"rouge",
			]);
		});

		test("should update only values without changing name", async () => {
			const category = await api.categories.post({
				name: "category values only",
				file: file(`${import.meta.dir}/public/cumin.webp`),
				attributes: {
					create: [
						{
							name: "taille",
							values: ["small"],
						},
					],
				},
			});

			expectDefined(category.data);
			const attributeId = category.data.attributes[0]?.id;
			expectDefined(attributeId);

			const { data, status } = await api
				.categories({ id: category.data.id })
				.patch({
					name: category.data.name,
					attributes: {
						update: [
							{
								id: attributeId,
								values: {
									create: ["large", "medium"],
								},
							},
						],
					},
				});

			expect(status).toBe(200);
			expectDefined(data);
			expect(data.attributes[0]?.name).toBe("taille");
			expect(data.attributes[0]?.values).toHaveLength(3);
		});
	});
});
