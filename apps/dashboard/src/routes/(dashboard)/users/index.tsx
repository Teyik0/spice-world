import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { authClient, getBetterAuthCookie } from '@/lib/auth-client'
import { component$ } from '@qwik.dev/core'
import { routeLoader$ } from '@qwik.dev/router'
import { Image } from '@unpic/qwik'
import type { UserWithRole } from 'better-auth/plugins'
import { EditUserDialog } from './management'

export const useListUsers = routeLoader$(async (requestEvent) => {
  let searchField: 'name' | 'email' = 'email'

  switch (requestEvent.params.searchField) {
    case 'name':
      searchField = 'name'
      break
    default:
      searchField = 'email'
      break
  }

  const users = await authClient.admin.listUsers(
    {
      query: {
        limit: 50,
        searchField,
        searchValue: requestEvent.params.searchValue || '',
        searchOperator: 'contains',
        offset: requestEvent.params.offset || 0,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      },
    },
    {
      headers: {
        cookie: getBetterAuthCookie(requestEvent.cookie),
      },
    },
  )

  return users
})

export default component$(() => {
  const users = useListUsers()
  return (
    <div class="container mx-auto p-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.value.data?.users.map((user) => (
            <UserRow user={user} key={user.id} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
})

const UserRow = component$(({ user }: { user: UserWithRole }) => {
  return (
    <TableRow key={user.id}>
      <TableCell>
        <div class="flex items-center gap-4">
          {user.image ? (
            <Image src={user.image} width={40} height={40} alt="avatar" class="rounded-lg" />
          ) : (
            <Image src="/favicon.svg" width={40} height={40} alt="avatar" class="rounded-lg" />
          )}
          <span>{user.name}</span>
        </div>
      </TableCell>
      <TableCell>{user.email}</TableCell>
      <TableCell>
        <Badge look="primary">{user.role?.toUpperCase()}</Badge>
      </TableCell>
      <TableCell>
        <div class="flex gap-2">
          <EditUserDialog user={user} />
          {/* <DeleteUserDialog user={user} /> */}
        </div>
      </TableCell>
    </TableRow>
  )
})
