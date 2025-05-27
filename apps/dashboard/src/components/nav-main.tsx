import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuItem, sidebarMenuButtonVariants, useSidebar } from '@/components/ui/sidebar'
import { cn } from '@qwik-ui/utils'
import { component$ } from '@qwik.dev/core'
import { Link } from '@qwik.dev/router'
import { LuMoreHorizontal } from '@qwikest/icons/lucide'
import type { LucideIcon } from 'lucide-react'

interface NavMainProps {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
  variant?: 'default' | 'outline'
  size?: 'default' | 'sm' | 'lg'
  isActive?: boolean
}

export const NavMain = component$(({ items, variant = 'default', size = 'default', isActive }: NavMainProps) => {
  const { isMobile } = useSidebar()

  return (
    <SidebarMenu>
      {items.map((item) => (
        <DropdownMenu key={item.title} class="cursor-pointer">
          <SidebarMenuItem>
            <Link
              href={item.url}
              data-sidebar="menu-button"
              data-size={size}
              data-active={isActive}
              class={cn(
                sidebarMenuButtonVariants({ variant, size }),
                'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground justify-between w-full',
              )}
            >
              <span>{item.title}</span>
              {item.items?.length && (
                <DropdownMenuTrigger class="hover:bg-background hover:text-foreground p-1 rounded-sm cursor-pointer">
                  <LuMoreHorizontal />
                </DropdownMenuTrigger>
              )}
            </Link>

            {/* {item.items?.length && (
              <Dropdown.Popover
                gutter={8}
                floating="right-start"
                class="min-w-32 rounded-lg bg-background text-foreground -translate-y-1.5"
              >
                {item.items.map((item) => (
                  <DropdownMenuItem key={item.title} class="cursor-pointer border-3 border-background">
                    <a href={item.url}>{item.title}</a>
                  </DropdownMenuItem>
                ))}
              </Dropdown.Popover>
            )} */}
          </SidebarMenuItem>
        </DropdownMenu>
      ))}
    </SidebarMenu>
  )
})
