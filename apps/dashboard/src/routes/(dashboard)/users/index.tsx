import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { authClient, getBetterAuthCookie } from '@/lib/auth-client'
import { $, component$, useSignal, useTask$ } from '@qwik.dev/core'
import { routeLoader$, useLocation, useNavigate } from '@qwik.dev/router'
import { LuFilter, LuSearch, LuShield, LuUserCheck, LuUserX, LuUsers } from '@qwikest/icons/lucide'
import { Image } from '@unpic/qwik'
import type { UserWithRole } from 'better-auth/plugins'
import { CreateUserDialog } from './user-create-dialog'
import { DeleteUserDialog } from './user-delete-dialog'
import { EditUserDialog } from './user-edit-dialog'

export const useListUsers = routeLoader$(async (requestEvent) => {
  const url = requestEvent.url
  const searchParams = url.searchParams

  let searchField: 'name' | 'email' = 'email'
  const searchFieldParam = searchParams.get('searchField')

  switch (searchFieldParam) {
    case 'name':
      searchField = 'name'
      break
    default:
      searchField = 'email'
      break
  }

  const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0)
  const searchValue = searchParams.get('search') || ''
  const roleFilter = searchParams.get('role') || ''
  const sortBy = searchParams.get('sortBy') || 'createdAt'
  const sortDirection = searchParams.get('sortDirection') || 'desc'

  const users = await authClient.admin.listUsers(
    {
      query: {
        limit,
        searchField,
        searchValue,
        searchOperator: 'contains',
        filterField: 'role',
        filterValue: roleFilter,
        offset,
        sortBy: sortBy as 'name' | 'email' | 'createdAt',
        sortDirection: sortDirection as 'asc' | 'desc',
      },
    },
    {
      headers: {
        cookie: getBetterAuthCookie(requestEvent.cookie),
      },
    },
  )

  const userList = users.data?.users || []
  const total = users.data?.total || 0

  // Calculate statistics
  const adminCount = userList.filter((user) => user.role === 'admin').length
  const verifiedCount = userList.filter((user) => user.emailVerified).length
  const bannedCount = userList.filter((user) => user.banned).length

  return {
    users: userList,
    total,
    limit,
    offset,
    searchValue,
    searchField,
    roleFilter,
    sortBy,
    sortDirection,
    stats: {
      total,
      adminCount,
      verifiedCount,
      bannedCount,
    },
  }
})

export default component$(() => {
  const usersData = useListUsers()
  const location = useLocation()
  const navigate = useNavigate()

  const searchValue = useSignal(usersData.value.searchValue)
  const searchField = useSignal(usersData.value.searchField)
  const roleFilter = useSignal(usersData.value.roleFilter)

  useTask$(({ track }) => {
    track(() => searchValue.value)
    track(() => searchField.value)
    track(() => roleFilter.value)
  })

  const handleSearch = $(() => {
    const params = new URLSearchParams(location.url.searchParams)
    if (searchValue.value.trim()) {
      params.set('search', searchValue.value.trim())
    } else {
      params.delete('search')
    }
    params.set('searchField', searchField.value)
    if (roleFilter.value) {
      params.set('role', roleFilter.value)
    } else {
      params.delete('role')
    }
    params.set('offset', '0') // Reset to first page
    navigate(`${location.url.pathname}?${params.toString()}`)
  })

  const handlePageChange = $((newOffset: number) => {
    const params = new URLSearchParams(location.url.searchParams)
    params.set('offset', newOffset.toString())
    navigate(`${location.url.pathname}?${params.toString()}`)
  })

  const { users, total, limit, offset, stats } = usersData.value
  const currentPage = Math.floor(offset / limit) + 1
  const totalPages = Math.ceil(total / limit)
  const hasNextPage = offset + limit < total
  const hasPrevPage = offset > 0

  return (
    <div class="space-y-6 px-6">
      {/* Header */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <LuUsers class="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 class="text-2xl font-bold tracking-tight">Users</h1>
            <p class="text-muted-foreground">Manage user accounts and permissions</p>
          </div>
        </div>
        <CreateUserDialog />
      </div>

      {/* Statistics Cards */}
      <div class="grid gap-4 md:grid-cols-4">
        <Card.Root class="rounded-lg">
          <Card.Content class="p-6">
            <div class="flex items-center">
              <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
                <LuUsers class="h-6 w-6 text-blue-600" />
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-muted-foreground">Total Users</p>
                <p class="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root class="rounded-lg">
          <Card.Content class="p-6">
            <div class="flex items-center">
              <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100">
                <LuShield class="h-6 w-6 text-purple-600" />
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-muted-foreground">Administrators</p>
                <p class="text-2xl font-bold">{stats.adminCount}</p>
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root class="rounded-lg">
          <Card.Content class="p-6">
            <div class="flex items-center">
              <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
                <LuUserCheck class="h-6 w-6 text-green-600" />
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-muted-foreground">Verified</p>
                <p class="text-2xl font-bold">{stats.verifiedCount}</p>
              </div>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root class="rounded-lg">
          <Card.Content class="p-6">
            <div class="flex items-center">
              <div class="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100">
                <LuUserX class="h-6 w-6 text-red-600" />
              </div>
              <div class="ml-4">
                <p class="text-sm font-medium text-muted-foreground">Banned</p>
                <p class="text-2xl font-bold">{stats.bannedCount}</p>
              </div>
            </div>
          </Card.Content>
        </Card.Root>
      </div>

      {/* Filters */}
      <Card.Root class="rounded-lg">
        <Card.Content class="p-6">
          <div class="grid gap-4 md:grid-cols-4">
            <div class="md:col-span-2 flex flex-col gap-2">
              <Label for="search">Search Users</Label>
              <div class="relative">
                <LuSearch class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name or email..."
                  class="pl-10"
                  bind:value={searchValue}
                  onKeyDown$={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch()
                    }
                  }}
                />
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <Label for="searchField">Search Field</Label>
              <Select
                name="searchField"
                value={searchField.value}
                options={[
                  { label: 'Email', value: 'email' },
                  { label: 'Name', value: 'name' },
                ]}
                onInput$={(_, el) => {
                  searchField.value = el.value as 'name' | 'email'
                }}
              />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="role">Role Filter</Label>
              <Select
                name="role"
                value={roleFilter.value}
                options={[
                  { label: 'All Roles', value: '' },
                  { label: 'Admin', value: 'admin' },
                  { label: 'User', value: 'user' },
                ]}
                onInput$={(_, el) => {
                  roleFilter.value = el.value
                }}
              />
            </div>
          </div>
          <div class="flex justify-end mt-4">
            <Button onClick$={handleSearch}>
              <LuFilter class="h-4 w-4 mr-2" />
              Apply Filters
            </Button>
          </div>
        </Card.Content>
      </Card.Root>

      {/* Results */}
      <Card.Root class="rounded-lg mb-8">
        <Card.Header>
          <div class="flex items-center justify-between">
            <div>
              <Card.Title>Users ({total})</Card.Title>
              <Card.Description>
                Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} users
              </Card.Description>
            </div>
          </div>
        </Card.Header>
        <Card.Content class="p-0">
          <div class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[250px]">User</TableHead>
                  <TableHead class="hidden md:table-cell">Email</TableHead>
                  <TableHead class="w-[100px]">Role</TableHead>
                  <TableHead class="hidden lg:table-cell w-[120px]">Status</TableHead>
                  <TableHead class="hidden xl:table-cell w-[100px]">Joined</TableHead>
                  <TableHead class="text-right w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} class="text-center py-8 text-muted-foreground">
                      <div class="flex flex-col items-center space-y-2">
                        <LuUsers class="h-8 w-8 text-muted-foreground/50" />
                        <p>No users found matching your criteria.</p>
                        <p class="text-xs">Try adjusting your search filters.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => <UserRow user={user} key={user.id} />)
                )}
              </TableBody>
            </Table>
          </div>
        </Card.Content>
      </Card.Root>

      {/* Pagination */}
      {totalPages > 1 && (
        <div class="flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div class="flex items-center gap-2">
            <Button
              look="outline"
              size="sm"
              disabled={!hasPrevPage}
              onClick$={() => handlePageChange(Math.max(0, offset - limit))}
            >
              Previous
            </Button>
            <Button look="outline" size="sm" disabled={!hasNextPage} onClick$={() => handlePageChange(offset + limit)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
})

const UserRow = component$(({ user }: { user: UserWithRole }) => {
  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <TableRow key={user.id} class="hover:bg-muted/50 transition-colors">
      <TableCell>
        <div class="flex items-center gap-3">
          <div class="relative">
            {user.image ? (
              <Image
                src={user.image}
                width={40}
                height={40}
                alt={`${user.name || 'User'}'s avatar`}
                class="rounded-full object-cover"
              />
            ) : (
              <div class="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <span class="text-sm font-medium text-primary" aria-hidden="true">
                  {user.name?.charAt(0)?.toUpperCase() || user.email?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
            )}
            {user.emailVerified && (
              <div
                class="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background"
                title="Email verified"
                aria-label="Email verified"
              />
            )}
          </div>
          <div class="min-w-0 flex-1">
            <p class="font-medium text-sm truncate">{user.name || 'Unnamed User'}</p>
            <div class="flex items-center gap-2">
              <p class="text-xs text-muted-foreground truncate md:hidden">{user.email}</p>
              <p class="text-xs text-muted-foreground">ID: {user.id.slice(0, 8)}...</p>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell class="hidden md:table-cell">
        <span class="text-sm truncate block max-w-[200px]" title={user.email}>
          {user.email}
        </span>
      </TableCell>
      <TableCell>
        <Badge look={user.role === 'admin' ? 'primary' : 'secondary'} class="text-xs">
          {user.role?.toUpperCase() || 'USER'}
        </Badge>
      </TableCell>
      <TableCell class="hidden lg:table-cell">
        <div class="flex flex-col gap-1">
          {user.emailVerified ? (
            <Badge look="outline" class="text-green-700 border-green-200 bg-green-50 text-xs w-fit">
              Verified
            </Badge>
          ) : (
            <Badge look="outline" class="text-yellow-700 border-yellow-200 bg-yellow-50 text-xs w-fit">
              Unverified
            </Badge>
          )}
          {user.banned && (
            <Badge look="alert" class="text-xs w-fit">
              Banned
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell class="hidden xl:table-cell">
        <span class="text-sm text-muted-foreground">{formatDate(user.createdAt)}</span>
      </TableCell>
      <TableCell>
        <div class="flex items-center justify-end gap-2">
          <EditUserDialog user={user} />
          <DeleteUserDialog user={user} />
        </div>
      </TableCell>
    </TableRow>
  )
})
