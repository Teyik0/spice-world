import type { PrismaClient } from "@spice-world/server/prisma/client";
import type { ProductModel } from "../model";

type PrismaTransaction = Omit<
	PrismaClient,
	"$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function executeVariantOperations(
	tx: PrismaTransaction,
	productId: string,
	categoryId: string,
	ops: typeof ProductModel.variantOperations.static | undefined,
): Promise<void> {
	if (!ops) return;

	const allowedAttributeValues = await tx.attributeValue.findMany({
		where: { attribute: { categoryId } },
		select: { id: true, attributeId: true },
	});

	const promises: Promise<unknown>[] = [];

	if (ops.delete && ops.delete.length > 0) {
		promises.push(
			tx.productVariant.deleteMany({
				where: { id: { in: ops.delete }, productId },
			}),
		);
	}

	if (ops.update && ops.update.length > 0) {
		for (const variant of ops.update) {
			// if (variant.attributeValueIds !== undefined) {
			// 	validateVariantAttributeValues(
			// 		variant.sku ?? variant.id,
			// 		variant.attributeValueIds,
			// 		allowedAttributeValues,
			// 	);
			// }

			promises.push(
				tx.productVariant.update({
					where: { id: variant.id },
					data: {
						...(variant.price !== undefined && { price: variant.price }),
						...(variant.sku !== undefined && { sku: variant.sku }),
						...(variant.stock !== undefined && { stock: variant.stock }),
						...(variant.currency !== undefined && {
							currency: variant.currency,
						}),
						...(variant.attributeValueIds !== undefined && {
							attributeValues: {
								set: variant.attributeValueIds.map((avId: string) => ({
									id: avId,
								})),
							},
						}),
					},
				}),
			);
		}
	}

	if (ops.create && ops.create.length > 0) {
		for (const variant of ops.create) {
			// validateVariantAttributeValues(
			// 	variant.sku ?? "",
			// 	variant.attributeValueIds,
			// 	allowedAttributeValues,
			// );

			promises.push(
				tx.productVariant.create({
					data: {
						productId,
						price: variant.price,
						sku: variant.sku,
						stock: variant.stock ?? 0,
						currency: variant.currency ?? "EUR",
						attributeValues: {
							connect: variant.attributeValueIds.map((avId: string) => ({
								id: avId,
							})),
						},
					},
				}),
			);
		}
	}

	await Promise.all(promises);
}
