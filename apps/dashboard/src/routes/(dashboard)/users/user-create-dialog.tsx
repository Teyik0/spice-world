import { TextInput } from '@/components/text-input'
import { Button, buttonVariants } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Select } from '@/components/ui/select'
import { authClient, getBetterAuthCookie } from '@/lib/auth-client'
import { FormError, formAction$, reset, useForm, valiForm$ } from '@modular-forms/qwik'
import { cn } from '@qwik-ui/utils'
import { component$, useSignal, useTask$ } from '@qwik.dev/core'
import { LuLoader2, LuUserPlus, LuX } from '@qwikest/icons/lucide'
import { toast } from 'qwik-sonner'
import * as v from 'valibot'

const CreateUserSchema = v.object({
  name: v.pipe(
    v.string(),
    v.nonEmpty('Please enter the user name.'),
    v.minLength(2, 'Name must be at least 2 characters.'),
  ),
  email: v.pipe(v.string(), v.nonEmpty('Please enter the email.'), v.email('Please enter a valid email address.')),
  password: v.pipe(
    v.string(),
    v.nonEmpty('Please enter a password.'),
    v.minLength(8, 'Password must be at least 8 characters.'),
  ),
  role: v.union([v.literal('user'), v.literal('admin')], 'Role must be either "user" or "admin".'),
})

export type CreateUserForm = v.InferInput<typeof CreateUserSchema>

export const useFormCreateAction = formAction$<CreateUserForm>(async (values, { cookie }) => {
  const { data, error } = await authClient.admin.createUser(
    {
      name: values.name,
      email: values.email,
      password: values.password, // This will be hashed by Better Auth server
      role: values.role,
    },
    {
      headers: {
        cookie: getBetterAuthCookie(cookie),
      },
    },
  )

  if (data) {
    return {
      status: 'success',
      message: 'User created successfully',
      data: data.user,
    }
  }

  throw new FormError<CreateUserForm>(error.message || 'Failed to create user')
}, valiForm$(CreateUserSchema))

export const CreateUserDialog = component$(() => {
  const [createForm, { Form, Field }] = useForm<CreateUserForm>({
    loader: { value: { name: '', email: '', password: '', role: 'user' } as CreateUserForm },
    action: useFormCreateAction(),
    validate: valiForm$(CreateUserSchema),
  })

  const show = useSignal(false)

  useTask$(({ track }) => {
    const form = track(createForm)
    if (form.response.status === 'success') {
      show.value = false
      toast.success('User created successfully')
      reset(createForm)
    }
    if (form.response.status === 'error') {
      show.value = false
      toast.error(form.response.message)
      form.response.status = undefined
    }
  })

  return (
    <Modal.Root bind:show={show}>
      <Modal.Trigger class={[buttonVariants({ look: 'primary', size: 'md' })]}>
        <LuUserPlus class="h-4 w-4 mr-2" />
        Add User
      </Modal.Trigger>
      <Modal.Panel position="center" class="max-w-lg max-h-[90vh] overflow-auto">
        <Modal.Title>Create New User</Modal.Title>
        <Modal.Description>
          Add a new user to the system. They will receive an email with account details.
        </Modal.Description>

        <Form class="grid gap-4 mt-6">
          <Field name="name">
            {(field, props) => (
              <TextInput
                {...props}
                type="text"
                label="Full Name"
                placeholder="John Doe"
                value={field.value}
                error={field.error}
                required
              />
            )}
          </Field>

          <Field name="email">
            {(field, props) => (
              <TextInput
                {...props}
                type="email"
                label="Email Address"
                placeholder="john@example.com"
                value={field.value}
                error={field.error}
                required
              />
            )}
          </Field>

          <Field name="password">
            {(field, props) => (
              <TextInput
                {...props}
                type="password"
                label="Password"
                placeholder="Min. 8 characters"
                value={field.value}
                error={field.error}
                required
              />
            )}
          </Field>

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

          <footer class="flex justify-end gap-4 mt-4">
            <Button
              look="secondary"
              size="md"
              type="button"
              onClick$={() => (show.value = false)}
              disabled={createForm.submitting}
            >
              Cancel
            </Button>
            <Button look="primary" size="md" type="submit" disabled={createForm.submitting}>
              {createForm.submitting ? (
                <>
                  <LuLoader2 class="animate-spin h-4 w-4 mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <LuUserPlus class="h-4 w-4 mr-2" />
                  Create User
                </>
              )}
            </Button>
          </footer>
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
