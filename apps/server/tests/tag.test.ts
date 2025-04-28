import { treaty } from '@elysiajs/eden'
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { prisma } from '../src/lib/prisma'
import { tagRouter } from '../src/routes/tag.router'

const api = treaty(tagRouter)

describe('Tags routes test', () => {
  beforeAll(async () => {
    if (process.env.NODE_ENV === 'production') throw new Error("You can't run tests in production")
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL should be set')
    await prisma.tag.deleteMany()
  })

  afterAll(async () => {
    await prisma.tag.deleteMany()
  })

  describe('Create new tag - POST/', () => {
    it('should create a tag', async () => {
      for (let i = 0; i < 25; i++) {
        const char = String.fromCharCode(97 + i)
        const { data, status } = await api.tags.index.post({
          name: `tag ${char}`,
          badgeColor: `#FF032F`,
        })

        expect(status).toBe(201)
        expect(data?.id).toBeDefined()
        expect(data?.name).toBe(`tag ${char}`)
        expect(data?.badgeColor).toBe(`#FF032F`)
        expect(data?.createdAt).toBeDefined()
        expect(data?.updatedAt).toBeDefined()
      }
    })

    it('should throw an error if badge is not a color valid hex - (1)', async () => {
      const { error, data } = await api.tags.index.post({
        name: 'data',
        badgeColor: 'F21DE2',
      })

      expect(data).toBe(null)
      expect(error?.status).toBe(422)
      expect(error?.value.type).toBe('validation')
      expect(error?.value.property).toBe('/badgeColor')
    })

    it('should throw an error if badge is not a color valid hex - (1)', async () => {
      // Hexadecimal color code must start with #
      const { error, data } = await api.tags.index.post({
        name: 'data',
        badgeColor: 'F21DE2',
      })

      expect(data).toBe(null)
      expect(error?.status).toBe(422)
      expect(error?.value.type).toBe('validation')
      expect(error?.value.property).toBe('/badgeColor')
    })

    it('should throw an error if badge is not a color valid hex - (2)', async () => {
      // Hexadecimal color code must be 6 characters long
      const { error, data } = await api.tags.index.post({
        name: 'data',
        badgeColor: '#00112233',
      })

      expect(data).toBe(null)
      expect(error?.status).toBe(422)
      expect(error?.value.type).toBe('validation')
      expect(error?.value.property).toBe('/badgeColor')
    })

    it('should throw an error if badge is not a color valid hex - (3)', async () => {
      // Hexadecimal color code must be 6 characters long
      const { error, data } = await api.tags.index.post({
        name: 'data',
        badgeColor: '#00',
      })

      expect(data).toBe(null)
      expect(error?.status).toBe(422)
      expect(error?.value.type).toBe('validation')
      expect(error?.value.property).toBe('/badgeColor')
    })

    it('should throw an error if badge is not a color valid hex - (4)', async () => {
      // Hexadecimal color code must be between A-F
      const { error, data } = await api.tags.index.post({
        name: 'data',
        badgeColor: '#GEZE02',
      })

      expect(data).toBe(null)
      expect(error?.status).toBe(422)
      expect(error?.value.type).toBe('validation')
      expect(error?.value.property).toBe('/badgeColor')
    })
  })

  describe('Get tags by id - GET/:id', () => {
    it('should return a single tag', async () => {
      const { data } = await api.tags.index.post({
        name: 'data',
        badgeColor: '#FF0323',
      })

      const { data: tag } = await api.tags({ id: data?.id! }).get()
      expect(tag?.id).toBe(data?.id!)
      expect(tag?.name).toBe(data?.name!)
      expect(tag?.badgeColor).toBe(data?.badgeColor!)
      expect(tag?.createdAt).toBe(data?.createdAt!)
      expect(tag?.updatedAt).toBe(data?.updatedAt!)
    })
  })

  describe('Get tags count - GET/count', () => {
    it('should return the count of tags', async () => {
      const totalTags = await prisma.tag.count()
      const { data } = await api.tags.count.get()
      expect(data).toBe(totalTags)
    })
  })

  describe('Get tags - GET/', () => {
    it('should return 20 tags', async () => {
      const { data } = await api.tags.index.get({
        query: {
          skip: 0,
          take: 20,
        },
      })

      expect(data?.length).toBe(20)
    })

    it('should return all the tags in the database', async () => {
      const { data: totalTagNumber } = await api.tags.count.get()
      const { data } = await api.tags.index.get({
        query: {
          skip: 0,
          take: totalTagNumber! + 40,
        },
      })

      expect(data?.length).toBe(totalTagNumber!)
    })

    it('should return tags with pagination', async () => {
      const { data } = await api.tags.index.get({
        query: {
          skip: 0,
          take: 10,
        },
      })

      expect(data?.length).toBe(10)

      const { data: data2 } = await api.tags.index.get({
        query: {
          skip: 1,
          take: 10,
        },
      })

      expect(data2?.length).toBe(10)
      expect(data2).not.toBe(data)
      expect(data2).not.toEqual(data)
    })

    it('should return tags with specific search - (1)', async () => {
      const { data } = await api.tags.index.get({
        query: {
          skip: 0,
          take: 10,
          name: 'data',
        },
      })
      if (!data) throw new Error('No data found')
      expect(data.length).toBe(1)
      expect(data[0].name).toBe('data')
    })

    it('should return tags with specific search - (2)', async () => {
      const { data } = await api.tags.index.get({
        query: {
          skip: 0,
          take: 40,
          name: 'tag',
        },
      })
      if (!data) throw new Error('No data found')
      expect(data.length).toBe((await prisma.tag.count()) - 1)
    })
  })

  describe('Delete tags - DELETE/:id', () => {
    it('should delete a tag', async () => {
      const { data: createdTag } = await api.tags.index.post({
        name: 'tag to delete',
        badgeColor: '#FF0323',
      })

      const { data: deletedTag } = await api.tags({ id: createdTag!.id }).delete()
      expect(deletedTag).toBeDefined()
      expect(deletedTag!.id).toBe(createdTag!.id)

      const { data: fetchedTag, error } = await api.tags({ id: createdTag!.id }).get()
      expect(fetchedTag).toBeNull()
      expect(error!.value).toBe('Tag not found')
    })
  })

  describe('Update tags - PATCH/:id', () => {
    it('should update a tag', async () => {
      const { data: createdTag } = await api.tags.index.post({
        name: 'original name',
        badgeColor: '#FF0323',
      })
      expect(createdTag).toBeDefined()

      const { data: updatedTag } = await api.tags({ id: createdTag!.id }).patch({
        name: 'updated name',
        badgeColor: '#00FF00',
      })

      expect(updatedTag).toBeDefined()
      expect(updatedTag!.id).toBe(createdTag!.id)
      expect(updatedTag!.name).toBe('updated name')
      expect(updatedTag!.badgeColor).toBe('#00FF00')
    })
  })
})
