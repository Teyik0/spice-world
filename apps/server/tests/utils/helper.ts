import { expect } from "bun:test";
import type { UploadedFileData } from "uploadthing/types";

export function expectDefined<T>(value: T): asserts value is NonNullable<T> {
	expect(value).not.toBeUndefined();
	expect(value).not.toBeNull();
}

export const createUploadedFileData = (file: File): UploadedFileData => ({
	key: `mock-key-${Date.now()}-${Math.random()}`,
	url: "https://mock-uploadthing.com/image.webp",
	appUrl: "https://mock-uploadthing.com/image.webp",
	ufsUrl: "https://mock-uploadthing.com/image.webp",
	name: file.name,
	size: file.size,
	customId: null,
	type: "image/webp",
	fileHash: "mock-hash",
});
