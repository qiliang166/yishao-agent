import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import TeachingDocPanel from '../TeachingDocPanel'

// Mock api module
vi.mock('../../services/api', () => ({
  api: {
    llmGenerate: vi.fn(),
    saveStep: vi.fn(),
    saveFileToProject: vi.fn(),
  },
}))

// Mock useModal
vi.mock('../ModalProvider', () => ({
  useModal: () => ({ toast: vi.fn(), confirm: vi.fn(), prompt: vi.fn() }),
}))

const defaultProps = {
  docType: 'sop' as const,
  projectId: 'test-1',
  steps: {
    raw_video: 'test video content',
    raw_text: 'test text content',
    raw_file: 'test file content',
    step2_sop: 'existing sop content',
    _model_s2_sop: 'provider1:model-a',
  },
  savedSteps: {
    step2_sop: 'existing sop content',
  },
  prompt: 'test system prompt',
  skill: 'test skill template',
  llmProviders: [
    { id: 'provider1', name: 'Provider 1', is_enabled: true, models: ['model-a', 'model-b'] },
    { id: 'provider2', name: 'Provider 2', is_enabled: true, models: ['model-c'] },
  ],
  onRefresh: vi.fn(),
}

describe('TeachingDocPanel', () => {
  it('生成按钮独立 — 点击生成不影响其他按钮状态', async () => {
    render(<TeachingDocPanel {...defaultProps} />)
    const genBtn = screen.getByText(/AI 生成/)
    fireEvent.click(genBtn)
    // 生成中按钮文字变化
    expect(screen.getByText(/生成中/)).toBeDefined()
    // 数据源选择器仍可用（未被生成影响）
    const sourceSelect = screen.getByRole('combobox', { name: /数据来源/ })
    expect(sourceSelect).not.toBeDisabled()
  })

  it('空内容时保存按钮不显示"已保存"', () => {
    render(<TeachingDocPanel {...defaultProps} docType="dao" steps={{}} savedSteps={{}} />)
    // 保存按钮存在
    const saveBtn = screen.getByText(/保存/)
    expect(saveBtn).toBeDefined()
    // 保存按钮不显示"已保存"
    expect(screen.queryByText('✓ 已保存')).toBeNull()
  })

  it('修改模型选择器不影响其他 Panel 的模型值', async () => {
    const { rerender } = render(<TeachingDocPanel {...defaultProps} />)
    const modelSelect = screen.getByRole('combobox', { name: /大模型/ })
    // 初始值来自 steps 中的持久化值
    expect((modelSelect as HTMLSelectElement).value).toBe('provider1:model-a')
    // 切换模型
    fireEvent.change(modelSelect, { target: { value: 'provider2:model-c' } })
    expect((modelSelect as HTMLSelectElement).value).toBe('provider2:model-c')
    // 用不同的 docType 重新渲染，模型值独立
    rerender(<TeachingDocPanel {...defaultProps} docType="dao" steps={{
      ...defaultProps.steps,
      _model_s2_dao: 'provider1:model-b',
    }} />)
    const daoModelSelect = screen.getByRole('combobox', { name: /大模型/ })
    expect((daoModelSelect as HTMLSelectElement).value).toBe('provider1:model-b')
  })
})
