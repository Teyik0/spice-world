import { status } from "elysia";
import { prisma } from "@/lib/prisma";
import type { uuid } from "../shared";
import type { AttributeModel, AttributeValueModel } from "./model";

export const attributeService = {
	async get({ categoryId }: AttributeModel.getQuery) {
		const attributes = await prisma.attribute.findMany({
			where: categoryId ? { categoryId } : undefined,
			include: { values: true },
		});
		return attributes;
	},

	async getById({ id }: { id: string }) {
		const attribute = await prisma.attribute.findUnique({
			where: { id },
			include: { values: true, category: true },
		});

		return attribute ?? status("Not Found", "Attribute not found");
	},

	async post({ categoryId, name, values }: AttributeModel.postBody) {
		const attribute = await prisma.attribute.create({
			data: {
				name,
				categoryId,
				values: {
					createMany: {
						data: values.map((value) => ({ value })),
					},
				},
			},
			include: { values: true },
		});
		return status("Created", attribute);
	},

	async count() {
		const count = await prisma.attribute.count();
		return count;
	},

	async patch({ id, name }: AttributeModel.patchBody & uuid) {
		const attribute = prisma.attribute.update({
			where: { id },
			data: {
				name,
			},
			include: { values: true },
		});
		return attribute;
	},

	async delete({ id }: uuid) {
		await prisma.attribute.delete({
			where: {
				id,
			},
		});
		return status(200);
	},
};

export const attributeValueService = {
	async post({ id, name }: AttributeValueModel.postBody & uuid) {
		const attributeValue = await prisma.attributeValue.create({
			data: {
				value: name,
				attributeId: id,
			},
		});
		return status("Created", attributeValue);
	},

	async patch({ id, name }: AttributeValueModel.patchBody & uuid) {
		const attributeValue = prisma.attributeValue.update({
			where: { id },
			data: { value: name },
		});
		return attributeValue;
	},

	async delete({ id }: uuid) {
		await prisma.attributeValue.delete({
			where: { id },
		});
		return status(200);
	},
};
