import { Button, buttonVariants } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { cn } from '@qwik-ui/utils'
import { $, component$, useSignal } from '@qwik.dev/core'
import { LuAlertTriangle, LuLoader2, LuTrash2, LuX } from '@qwikest/icons/lucide'
import type { UserWithRole } from 'better-auth/plugins'
import { toast } from 'qwik-sonner'
import { useDeleteUser } from './layout'

export const DeleteUserDialog = component$(({ user }: { user: UserWithRole }) => {
  const action = useDeleteUser()

  const show = useSignal(false)
  const loading = useSignal(false)

  const handleDelete = $(async () => {
    loading.value = true
    show.value = false

    toast.promise(action.submit({ userId: user.id }), {
      loading: `Deleting user: ${user.name}`,
      success: 'User deleted successfully',
      error: 'Failed to delete user',
    })
    loading.value = false
  })

  return (
    <Modal.Root bind:show={show}>
      <Modal.Trigger class={[buttonVariants({ look: 'destructive', size: 'sm' })]}>
        <LuTrash2 class="size-4" />
        <span class="sr-only">Delete user</span>
      </Modal.Trigger>
      <Modal.Panel position="center" class="max-w-lg max-h-[90vh] overflow-auto">
        <div class="flex items-center gap-3 mb-4">
          <div class="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <LuAlertTriangle class="h-5 w-5 text-destructive" />
          </div>
          <div>
            <Modal.Title class="text-lg font-semibold">Delete User</Modal.Title>
            <Modal.Description class="text-sm text-muted-foreground">This action cannot be undone.</Modal.Description>
          </div>
        </div>

        <div class="mb-6 p-4 rounded-lg bg-muted/50 border">
          <div class="text-sm">
            <p class="font-medium mb-1">You are about to delete:</p>
            <p class="text-muted-foreground">
              <span class="font-medium">{user.name}</span>
              <br />
              <span class="text-xs">{user.email}</span>
            </p>
          </div>
        </div>
        <footer class="flex justify-end gap-4 mt-4">
          <Button
            look="secondary"
            size="md"
            type="button"
            onClick$={() => (show.value = false)}
            disabled={loading.value}
          >
            Cancel
          </Button>
          <Button look="destructive" size="md" type="submit" disabled={loading.value} onClick$={handleDelete}>
            {loading.value ? (
              <>
                <LuLoader2 class="animate-spin h-4 w-4 mr-2" />
                Deleting...
              </>
            ) : (
              <>
                <LuTrash2 class="h-4 w-4 mr-2" />
                Delete User
              </>
            )}
          </Button>
        </footer>

        <Modal.Close
          class={cn(buttonVariants({ size: 'icon', look: 'ghost' }), 'absolute right-3 top-3')}
          type="button"
        >
          <LuX class="h-4 w-4" />
        </Modal.Close>
      </Modal.Panel>
    </Modal.Root>
  )
})
