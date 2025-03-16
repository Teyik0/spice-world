import sharp from "sharp";

import { UTApi } from "uploadthing/server";

export const utapi = new UTApi({
  token: process.env.UPLOADTHING_TOKEN!,
});

export const uploadFile = async (filename: string, file: File) => {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const outputImageBuffer = await sharp(buffer)
    .resize(200, 200)
    .webp()
    .toBuffer();

  return await utapi.uploadFiles(
    new File([outputImageBuffer], `${filename}.webp`),
  );
};

export const deleteFiles = async (ids: string[] | string) => {
  return await utapi.deleteFiles(ids);
};
