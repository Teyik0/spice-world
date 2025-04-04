import prisma from "../../src/libs/prisma";

export const createDummyCategory = async () => {
  const images = await prisma.image.createManyAndReturn({
    data: [
      {
        url: "dummy-url-1",
        key: "dummy-key-1",
        isThumbnail: true,
      },
      {
        url: "dummy-url-2",
        key: "dummy-key-2",
        isThumbnail: true,
      },
      {
        url: "dummy-url-3",
        key: "dummy-key-3",
        isThumbnail: true,
      },
      {
        url: "dummy-url-4",
        key: "dummy-key-4",
        isThumbnail: true,
      },
      {
        url: "dummy-url-5",
        key: "dummy-key-5",
        isThumbnail: true,
      },
      {
        url: "dummy-url-6",
        key: "dummy-key-6",
        isThumbnail: true,
      },
      {
        url: "dummy-url-7",
        key: "dummy-key-7",
        isThumbnail: true,
      },
      {
        url: "dummy-url-8",
        key: "dummy-key-8",
        isThumbnail: true,
      },
      {
        url: "dummy-url-9",
        key: "dummy-key-9",
        isThumbnail: true,
      },
    ],
  });

  const categories = await prisma.category.createManyAndReturn({
    data: [
      { name: "Whole Spices", imageId: images[0].id },
      { name: "Ground Spices", imageId: images[1].id },
      { name: "Herb Blends", imageId: images[2].id },
      { name: "Specialty Salts", imageId: images[3].id },
      { name: "Seasoning Mixes", imageId: images[4].id },
      { name: "Extracts", imageId: images[5].id },
      { name: "Chili Peppers", imageId: images[6].id },
      { name: "Peppercorns", imageId: images[7].id },
      { name: "Baking Spices", imageId: images[8].id },
    ],
  });

  return { images, categories };
};

export const deleteDummyCategory = async () => {
  await prisma.category.deleteMany();
  await prisma.image.deleteMany();
};
