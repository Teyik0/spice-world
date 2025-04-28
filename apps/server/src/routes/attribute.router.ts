import { Elysia, t } from 'elysia'
import { prisma } from '../lib/prisma'
import { prismaErrorPlugin } from '../plugins/prisma.plugin'

export const nameType = t.String({ pattern: '^[a-zà-ÿ][a-zà-ÿ ]*$' })

export const attributeRouter = new Elysia({
  name: 'attributes',
  prefix: '/attributes',
  tags: ['Attributes'],
})
  .use(prismaErrorPlugin('Attribute'))
  .model({ name: t.String({ pattern: '^[a-z][a-z ]*$' }) })
  .get(
    '/',
    async ({ query: { categoryId } }) =>
      prisma.attribute.findMany({
        where: categoryId ? { categoryId } : undefined,
        include: { values: true },
      }),
    {
      query: t.Object({
        categoryId: t.Optional(t.String({ format: 'uuid' })),
      }),
    },
  )
  .post(
    '/',
    async ({ body: { name, categoryId, values }, set }) => {
      set.status = 'Created'
      return await prisma.attribute.create({
        data: {
          name: name,
          categoryId: categoryId,
          values: {
            createMany: {
              data: values.map((value) => ({ value })),
            },
          },
        },
        include: { values: true },
      })
    },
    {
      body: t.Object({
        name: nameType,
        categoryId: t.String({ format: 'uuid' }),
        values: t.Array(nameType, {
          minItems: 1,
        }),
      }),
    },
  )
  .guard({ params: t.Object({ id: t.String({ format: 'uuid' }) }) })
  .get('/:id', async ({ params: { id }, error }) => {
    const attribute = await prisma.attribute.findUnique({
      where: { id },
      include: { values: true, category: true },
    })

    return attribute ?? error('Not Found', 'Attribute not found')
  })
  .patch(
    '/:id',
    async ({ params: { id }, body: { name } }) =>
      prisma.attribute.update({
        where: { id },
        data: {
          name: name,
        },
        include: { values: true },
      }),
    {
      body: t.Object({
        name: nameType,
      }),
    },
  )
  .delete('/:id', async ({ params: { id } }) =>
    prisma.attribute.delete({
      where: { id },
    }),
  )
  .post(
    '/:id/values',
    async ({ body, set, params: { id } }) => {
      set.status = 'Created'
      return await prisma.attributeValue.create({
        data: {
          value: body.value,
          attributeId: id,
        },
      })
    },
    {
      body: t.Object({
        value: nameType,
      }),
    },
  )
  .group('/values', (app) =>
    app
      .guard({ params: t.Object({ id: t.String({ format: 'uuid' }) }) })
      .patch(
        '/:id',
        async ({ params: { id }, body: { value } }) =>
          prisma.attributeValue.update({
            where: { id },
            data: { value },
          }),
        {
          body: t.Object({
            value: nameType,
          }),
        },
      )
      .delete('/:id', async ({ params: { id } }) =>
        prisma.attributeValue.delete({
          where: { id },
        }),
      ),
  )
