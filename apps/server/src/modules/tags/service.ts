import { status } from "elysia";
import { prisma } from "@/lib/prisma";
import type { uuid } from "../shared";
import type { TagModel } from "./model";

export const tagService = {
	async get({ skip, take, name }: TagModel.getQuery) {
		const tags = await prisma.tag.findMany({
			skip,
			take,
			where: {
				name: {
					contains: name,
				},
			},
		});
		return tags;
	},

	async getById({ id }: uuid) {
		const tag = await prisma.tag.findUnique({
			where: {
				id,
			},
		});
		return tag ?? status("Not Found", "Tag not found");
	},

	async post({ name, badgeColor }: TagModel.postBody) {
		const tag = await prisma.tag.create({
			data: {
				name,
				badgeColor,
			},
		});
		return status("Created", tag);
	},

	async count() {
		const count = await prisma.tag.count();
		return count;
	},

	async delete({ id }: uuid) {
		await prisma.tag.delete({
			where: {
				id,
			},
		});
		return status(200);
	},

	async patch({ id, name, badgeColor }: TagModel.patchBody & uuid) {
		const tag = await prisma.tag.update({
			where: {
				id,
			},
			data: {
				name,
				badgeColor,
			},
		});
		return tag;
	},
};
