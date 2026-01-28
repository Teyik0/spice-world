import { attribute, attributeValue, db } from "@spice-world/server/db";
import { NotFoundError } from "@spice-world/server/plugins/db.plugin";
import { eq } from "drizzle-orm";
import { status } from "elysia";
import type { uuidGuard } from "../shared";
import type { AttributeModel, AttributeValueModel } from "./model";

export const attributeService = {
	async get({ categoryId }: AttributeModel.getQuery) {
		const attributes = await db.query.attribute.findMany({
			where: categoryId ? eq(attribute.categoryId, categoryId) : undefined,
			with: { values: true },
		});
		return attributes;
	},

	async getById({ id }: { id: string }) {
		const result = await db.query.attribute.findFirst({
			where: eq(attribute.id, id),
			with: { values: true, category: true },
		});

		if (!result) {
			return status("Not Found", "Attribute not found");
		}

		return result;
	},

	async post({ categoryId, name, values }: AttributeModel.postBody) {
		const [newAttribute] = await db
			.insert(attribute)
			.values({
				name,
				categoryId,
			})
			.returning();

		if (!newAttribute) {
			throw new Error("Failed to create attribute");
		}

		// Create attribute values
		if (values.length > 0) {
			await db.insert(attributeValue).values(
				values.map((value) => ({
					value,
					attributeId: newAttribute.id,
				})),
			);
		}

		// Fetch the created attribute with values
		const createdAttribute = await db.query.attribute.findFirst({
			where: eq(attribute.id, newAttribute.id),
			with: { values: true },
		});

		return status("Created", createdAttribute);
	},

	async count() {
		const result = await db.select().from(attribute);
		return result.length;
	},

	async patch({ id, name }: AttributeModel.patchBody & uuidGuard) {
		const [updatedAttribute] = await db
			.update(attribute)
			.set({ name })
			.where(eq(attribute.id, id))
			.returning();

		if (!updatedAttribute) {
			throw new NotFoundError("Attribute");
		}

		// Fetch with values
		const result = await db.query.attribute.findFirst({
			where: eq(attribute.id, id),
			with: { values: true },
		});

		return result;
	},

	async delete({ id }: uuidGuard) {
		const [deleted] = await db
			.delete(attribute)
			.where(eq(attribute.id, id))
			.returning();

		if (!deleted) {
			throw new NotFoundError("Attribute");
		}

		return status(200);
	},
};

export const attributeValueService = {
	async post({ id, name }: AttributeValueModel.postBody & uuidGuard) {
		const [newValue] = await db
			.insert(attributeValue)
			.values({
				value: name,
				attributeId: id,
			})
			.returning();

		return status("Created", newValue);
	},

	async patch({ id, name }: AttributeValueModel.patchBody & uuidGuard) {
		const [updatedValue] = await db
			.update(attributeValue)
			.set({ value: name })
			.where(eq(attributeValue.id, id))
			.returning();

		if (!updatedValue) {
			throw new NotFoundError("AttributeValue");
		}

		return updatedValue;
	},

	async delete({ id }: uuidGuard) {
		const [deleted] = await db
			.delete(attributeValue)
			.where(eq(attributeValue.id, id))
			.returning();

		if (!deleted) {
			throw new NotFoundError("AttributeValue");
		}

		return status(200);
	},
};
