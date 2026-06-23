import { forwardRef } from 'react'

export interface TeachingDocPanelProps {
  docType: 'sop' | 'dao' | 'yanxi'
  projectId: string
  steps: Record<string, string>
  savedSteps: Record<string, string>
  prompt: string
  skill: string
  llmProviders: { id: string; name: string; is_enabled: boolean; models: string[] }[]
  onRefresh: () => void
}

const TeachingDocPanel = forwardRef<any, TeachingDocPanelProps>((_props, _ref) => {
  return <div>TeachingDocPanel stub</div>
})

export default TeachingDocPanel
