import { VerifyEmail } from '@spice-world/emails/src/spiceworld-welcome'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { admin, openAPI } from 'better-auth/plugins'
import Elysia from 'elysia'
import { Resend } from 'resend'
import { prisma } from '../lib/prisma'

const resend = new Resend(process.env.RESEND_API_KEY)
const from = 'Spice World <contact@spice-world.com>'

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  trustedOrigins: ['http://localhost:5173'],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from,
        to: [user.email],
        subject: 'Spice World - Reset your password',
        react: <VerifyEmail verifyLink={url} />,
      })
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await resend.emails.send({
        from,
        to: [user.email],
        subject: 'Spice World - Verify your email',
        react: <VerifyEmail verifyLink={url} />,
      })
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  plugins: [openAPI(), admin()],
})

export const openAPISchema = await auth.api.generateOpenAPISchema()

export const betterAuthPlugin = new Elysia({
  name: 'better-auth',
  tags: ['Auth'],
})
  .mount(auth.handler)
  .macro({
    user: {
      async resolve({ request: { headers } }) {
        const session = await auth.api.getSession({
          headers,
        })

        if (!session) return

        return {
          user: session.user,
          session: session.session,
        }
      },
    },
    isLogin: {
      async resolve({ error, request: { headers } }) {
        const session = await auth.api.getSession({
          headers,
        })

        if (!session) return error('Unauthorized')

        return {
          user: session.user,
          session: session.session,
        }
      },
    },
    isAdmin: {
      async resolve({ error, request: { headers } }) {
        const session = await auth.api.getSession({
          headers,
        })

        if (!session) return error('Unauthorized')
        if (session.user.role !== 'admin') return error('Unauthorized')

        return {
          user: session.user,
          session: session.session,
        }
      },
    },
  })
  .get('/api/user', ({ user }) => user, { user: true })
