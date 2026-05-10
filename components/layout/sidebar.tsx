'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { cn } from '@/lib/utils'
import {
  Home,
  BookOpen,
  FolderOpen,
  ClipboardList,
  Puzzle,
  List,
  BarChart2,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  GraduationCap,
  History,
  Sparkles,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

interface NavItem {
  href: string
  label: string
  icon: React.ElementType
  roles?: string[]
}

interface NavSection {
  label: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: '',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: Home },
    ],
  },
  {
    label: 'Module 1 — Exam Projects',
    items: [
      { href: '/exams', label: 'Projects', icon: FolderOpen, roles: ['ADMIN', 'TEACHER'] },
      { href: '/my-exams', label: 'My Exams', icon: GraduationCap, roles: ['ADMIN', 'TEACHER'] },
    ],
  },
  {
    label: 'Module 2 — Quiz Generator',
    items: [
      { href: '/quiz', label: 'My Quiz Sets', icon: Puzzle, roles: ['ADMIN', 'TEACHER'] },
      { href: '/my-results', label: 'My Results', icon: History },
    ],
  },
  {
    label: 'Module 3 — Study Prep',
    items: [
      { href: '/study-prep', label: 'Study Prep Sets', icon: Sparkles, roles: ['ADMIN', 'TEACHER'] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/users', label: 'Users', icon: Users, roles: ['ADMIN', 'TEACHER'] },
      { href: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] },
    ],
  },
]

interface SidebarProps {
  user: {
    name: string
    email: string
    role: string
  }
}

export function Sidebar({ user }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const pathname = usePathname()

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const canAccess = (roles?: string[]) => {
    if (!roles) return true
    return roles.includes(user.role)
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <aside
      className={cn(
        'flex flex-col bg-white border-r border-gray-200 transition-all duration-300 min-h-screen',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="bg-primary rounded-lg p-1.5">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-gray-900 text-lg">TestsGen</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto">
            <div className="bg-primary rounded-lg p-1.5">
              <BookOpen className="h-5 w-5 text-white" />
            </div>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => canAccess(item.roles))
          if (visibleItems.length === 0) return null

          return (
            <div key={section.label} className="mb-2">
              {section.label && !collapsed && (
                <p className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {section.label}
                </p>
              )}
              {section.label && !collapsed && (
                <div className="border-t border-gray-100 my-1" />
              )}
              {visibleItems.map((item) => {
                const Icon = item.icon
                const active = isActive(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                      collapsed && 'justify-center px-2'
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={cn('h-5 w-5 shrink-0', active && 'text-primary')} />
                    {!collapsed && <span>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      {/* User Menu */}
      <div className="p-2 border-t border-gray-200">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors',
                collapsed && 'justify-center px-2'
              )}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-primary text-white text-sm">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 truncate">{user.role}</p>
                </div>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Profile & Password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="flex items-center gap-2 text-red-600 focus:text-red-600"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  )
}
