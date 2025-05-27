import type { Cookie } from '@qwik.dev/router'
import type { auth } from '@spice-world/server/src/plugins/better-auth.plugin'
import { createAuthClient } from 'better-auth/client'
import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: import.meta.env.PUBLIC_BETTER_AUTH_URL as string,
  plugins: [adminClient(), inferAdditionalFields<typeof auth>()],
  fetchOptions: {
    credentials: 'include',
  },
})

export type Session = typeof authClient.$Infer.Session
export const { signIn, signOut, signUp } = authClient

export const getBetterAuthCookie = (cookie: Cookie) => {
  const cookieAuthName = 'better-auth.session_token'
  const betterAuthToken = cookie.get(cookieAuthName)
  return `${cookieAuthName}=${betterAuthToken?.value}`
}
