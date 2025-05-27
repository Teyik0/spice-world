import { Button, buttonVariants } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { authClient, getBetterAuthCookie } from '@/lib/auth-client'
import { FormError, formAction$, reset, useForm, valiForm$ } from '@modular-forms/qwik'
import { cn } from '@qwik-ui/utils'
import { component$, useSignal, useTask$ } from '@qwik.dev/core'
import { LuLoader2, LuPencil, LuX } from '@qwikest/icons/lucide'
import type { UserWithRole } from 'better-auth/plugins'
import { toast } from 'qwik-sonner'
import * as v from 'valibot'

const RoleSchema = v.object({
  role: v.union([v.literal('user'), v.literal('admin')], 'Role must be either "user" or "admin".'),
  userId: v.pipe(
    v.string(),
    v.nanoid('The Nano ID is badly formatted.'),
    v.length(21, 'The Nano ID must be 21 characters long.'),
  ),
})

export type RoleForm = v.InferInput<typeof RoleSchema>

export const useFormRoleAction = formAction$<RoleForm>(async (values, { cookie }) => {
  const response = await authClient.admin.setRole(
    {
      userId: values.userId,
      role: values.role,
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
      message: 'Role updated successfully',
    }
  }
  throw new FormError<RoleForm>('Failed to update user role')
}, valiForm$(RoleSchema))

export const EditUserDialog = component$(({ user }: { user: UserWithRole }) => {
  const [roleForm, { Form, Field }] = useForm<RoleForm>({
    loader: { value: { role: user.role, userId: user.id } as RoleForm },
    action: useFormRoleAction(),
    validate: valiForm$(RoleSchema),
  })

  const show = useSignal(false)

  useTask$(({ track }) => {
    const form = track(roleForm)
    if (form.response.status === 'success') {
      toast.success('User role updated successfully')
      show.value = false
      form.response.status = undefined
      reset(roleForm)
    }
    if (form.response.status === 'error') {
      toast.error(`Failed to update role: ${form.response.message}`)
      form.response.status = undefined
    }
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
        <Form class="grid gap-4 mt-6">
          <Field name="role">
            {(field, props) => (
              <Select
                {...props}
                value={field.value}
                options={[
                  { label: 'USER', value: 'user' },
                  { label: 'ADMIN', value: 'admin' },
                ]}
                error={field.error}
                label="Role"
              />
            )}
          </Field>
          <footer class="flex justify-end gap-4">
            <Button look="secondary" size="md" class="font-medium" type="button" onClick$={() => (show.value = false)}>
              Cancel
            </Button>
            <Button look="primary" size="md" class="font-medium" type="submit" disabled={roleForm.submitting}>
              {roleForm.submitting ? <LuLoader2 class="animate-spin h-4 w-4" /> : 'Save Changes'}
            </Button>
          </footer>
        </Form>
        <Modal.Close class={cn(buttonVariants({ size: 'icon', look: 'link' }), 'absolute right-3 top-2')} type="button">
          <LuX class="h-5 w-5" />
        </Modal.Close>
      </Modal.Panel>
    </Modal.Root>
  )
})
