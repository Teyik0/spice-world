import { Button, buttonVariants } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { authClient, getBetterAuthCookie } from '@/lib/auth-client'
import { FormError, formAction$, reset, useForm, valiForm$ } from '@modular-forms/qwik'
import { cn } from '@qwik-ui/utils'
import { component$, useSignal, useTask$ } from '@qwik.dev/core'
import { LuAlertTriangle, LuLoader2, LuTrash2, LuX } from '@qwikest/icons/lucide'
import type { UserWithRole } from 'better-auth/plugins'
import { toast } from 'qwik-sonner'
import * as v from 'valibot'

const DeleteUserSchema = v.object({
  userId: v.pipe(
    v.string(),
    v.nanoid('The Nano ID is badly formatted.'),
    v.length(21, 'The Nano ID must be 21 characters long.'),
  ),
})

export type DeleteUserForm = v.InferInput<typeof DeleteUserSchema>

export const useFormDeleteAction = formAction$<DeleteUserForm>(async (values, { cookie }) => {
  const response = await authClient.admin.removeUser(
    {
      userId: values.userId,
    },
    {
      headers: {
        cookie: getBetterAuthCookie(cookie),
      },
    },
  )

  if (response.data) {
    return {
      success: true,
      message: 'User deleted successfully',
    }
  }

  throw new FormError<DeleteUserForm>('Failed to delete user')
}, valiForm$(DeleteUserSchema))

export const DeleteUserDialog = component$(({ user }: { user: UserWithRole }) => {
  const [deleteForm, { Form, Field }] = useForm<DeleteUserForm>({
    loader: { value: { userId: user.id } as DeleteUserForm },
    action: useFormDeleteAction(),
    validate: valiForm$(DeleteUserSchema),
  })

  const show = useSignal(false)

  useTask$(({ track }) => {
    const form = track(deleteForm)
    if (form.response.status === 'success') {
      toast.success('User deleted successfully')
      show.value = false
      form.response.status = undefined
      reset(deleteForm)
    }
    if (form.response.status === 'error') {
      toast.error(`Failed to delete user: ${form.response.message}`)
      form.response.status = undefined
    }
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
              <span class="font-medium">{user.name || 'Unnamed User'}</span>
              <br />
              <span class="text-xs">{user.email}</span>
            </p>
          </div>
        </div>

        <Form class="space-y-4">
          <Field name="userId">{(field, props) => <input {...props} type="hidden" value={field.value} />}</Field>

          <div class="flex justify-end gap-3">
            <Button
              look="secondary"
              size="md"
              type="button"
              onClick$={() => (show.value = false)}
              disabled={deleteForm.submitting}
            >
              Cancel
            </Button>
            <Button look="destructive" size="md" type="submit" disabled={deleteForm.submitting}>
              {deleteForm.submitting ? (
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
          </div>
        </Form>

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
