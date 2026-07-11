import { useAuth } from '../contexts/AuthContext'

export function usePermission(code: string): boolean {
  const { user, loading } = useAuth()
  if (loading) return false
  if (!user) return false
  return user.permissions?.includes(code) ?? false
}

export function useOwnership(createdBy: string | null | undefined): boolean {
  const { user, loading } = useAuth()
  if (loading) return false
  if (!user) return false
  if (createdBy == null) return true // historical data
  if (user.permissions?.includes('project.edit_all')) return true
  return createdBy === user.user_id
}
