import { authClient, getBetterAuthCookie } from '@/lib/auth-client'
import { routeAction$ } from '@qwik.dev/router'

export const useDeleteUser = routeAction$(async ({ userId }, { cookie, fail }) => {
  const { data, error } = await authClient.admin.removeUser(
    { userId: String(userId) },
    { headers: { cookie: getBetterAuthCookie(cookie) } },
  )
  if (data) return { success: data.success }
  return fail(error.status, { message: error.message || 'Failed to delete user' })
})
