import { Button, buttonVariants } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { cn } from '@qwik-ui/utils'
import { $, component$, useSignal } from '@qwik.dev/core'
import { LuLoader2, LuPencil, LuX } from '@qwikest/icons/lucide'
import type { UserWithRole } from 'better-auth/plugins'
import { toast } from 'qwik-sonner'
import { useEditUserRole } from './layout'

export const EditUserDialog = component$(({ user }: { user: UserWithRole }) => {
  const action = useEditUserRole()
  const show = useSignal(false)
  const loading = useSignal(false)
  const role = useSignal(user.role)

  const handleEdit = $(async () => {
    loading.value = true
    show.value = false

    toast.promise(action.submit({ userId: user.id, role: role.value }), {
      loading: `Updating role for ${user.name || user.email}`,
      success: 'User role updated successfully',
      error: 'Failed to update user role',
    })
    loading.value = false
  })

  return (
    <Modal.Root bind:show={show}>
      <Modal.Trigger class={[buttonVariants({ look: 'outline', size: 'sm' })]}>
        <LuPencil class="size-4" />
        <span class="sr-only">Edit user</span>
      </Modal.Trigger>
      <Modal.Panel position="center" class="max-w-md max-h-[90vh] overflow-auto">
        <Modal.Title>Edit User Role</Modal.Title>
        <Modal.Description>
          Update the role for {user.name || user.email}. This action will change their permissions.
        </Modal.Description>
        <div class="grid gap-4 mt-6">
          <Select
            name="Rôle"
            value={role.value}
            options={[
              { label: 'USER', value: 'user' },
              { label: 'ADMIN', value: 'admin' },
            ]}
            onInput$={(_, el) => (role.value = el.value)}
            label="Role"
            required
          />
          <footer class="flex justify-end gap-4">
            <Button
              look="secondary"
              size="md"
              class="font-medium"
              type="button"
              onClick$={() => (show.value = false)}
              disabled={loading.value}
            >
              Cancel
            </Button>
            <Button
              look="primary"
              size="md"
              class="font-medium"
              type="button"
              disabled={loading.value}
              onClick$={handleEdit}
            >
              {loading.value ? <LuLoader2 class="animate-spin h-4 w-4" /> : 'Save Changes'}
            </Button>
          </footer>
        </div>
        <Modal.Close class={cn(buttonVariants({ size: 'icon', look: 'link' }), 'absolute right-3 top-2')} type="button">
          <LuX class="h-5 w-5" />
        </Modal.Close>
      </Modal.Panel>
    </Modal.Root>
  )
})
