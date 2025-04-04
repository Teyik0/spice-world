import prisma from '../../src/libs/prisma';

export const createDummyTags = async () => {
  const tag1 = await prisma.tag.create({
    data: {
      name: 'spicy',
      badgeColor: `#FF032F`
    }
  });

  const tag2 = await prisma.tag.create({
    data: {
      name: 'hot',
      badgeColor: `#FF032F`
    }
  });

  const tag3 = await prisma.tag.create({
    data: {
      name: 'medium',
      badgeColor: `#FF032F`
    }
  });
  return [tag1, tag2, tag3];
};

export const deleteDummyTags = async () => {
  await prisma.tag.deleteMany();
};
