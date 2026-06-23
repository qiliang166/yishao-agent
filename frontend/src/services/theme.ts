export interface ThemePreset {
  id: string
  name: string
  isDefault: boolean
  colors: Record<string, string>
}

export const DEFAULT_THEMES: ThemePreset[] = [
  {
    id: 'classic', name: '经典酒红', isDefault: true,
    colors: {
      bg: '#FAFAF8', card: '#FFFFFF', text: '#1A1A1A', textSecondary: '#6B6B6B',
      primary: '#8B1A1A', primaryLight: '#FBF5F3', border: '#E8E5E0',
      success: '#4A8B3F', warning: '#C75B39', purple: '#7C3AED', cyan: '#0891B2',
      primaryHover: '#6E1515', bgSecondary: '#F5F3F0', bgHover: '#F0EFEC',
      muted: '#D4C8B8', btnDirtyBg: '#A0522D', btnDirtyText: '#ffffff',
      successLight: '#EDF7EB',
    }
  },
  {
    id: 'green', name: '墨绿雅韵', isDefault: false,
    colors: {
      bg: '#F6F9F7', card: '#FFFFFF', text: '#1A1A1A', textSecondary: '#5A6B5F',
      primary: '#2D6A4F', primaryLight: '#EDF5F0', border: '#DDE5DF',
      success: '#3A7D44', warning: '#B85C38', purple: '#7C3AED', cyan: '#0891B2',
      primaryHover: '#1F4D37', bgSecondary: '#EDF2EE', bgHover: '#E8F0EA',
      muted: '#B5C5BA', btnDirtyBg: '#7A5230', btnDirtyText: '#ffffff',
      successLight: '#E6F3E8',
    }
  },
  {
    id: 'dark', name: '暗夜模式', isDefault: false,
    colors: {
      bg: '#1A1A1E', card: '#252528', text: '#E5E5E5', textSecondary: '#999999',
      primary: '#C45C5C', primaryLight: '#2A2020', border: '#3A3A3E',
      success: '#5AAD55', warning: '#E07B50', purple: '#9F7BEA', cyan: '#2EB5C6',
      primaryHover: '#A84A4A', bgSecondary: '#303034', bgHover: '#2A2A2E',
      muted: '#5A5A5E', btnDirtyBg: '#C47A50', btnDirtyText: '#ffffff',
      successLight: '#1E3A1E',
    }
  },
]

const CSS_VAR_MAP: Record<string, string> = {
  bg: '--bg', card: '--card', text: '--text', textSecondary: '--text-secondary',
  primary: '--primary', primaryLight: '--primary-light', border: '--border',
  success: '--success', warning: '--warning', purple: '--purple', cyan: '--cyan',
  primaryHover: '--primary-hover', bgSecondary: '--bg-secondary',
  bgHover: '--bg-hover', muted: '--muted',
  btnDirtyBg: '--btn-dirty-bg', btnDirtyText: '--btn-dirty-text',
  successLight: '--success-light',
}

const ALL_VARS = Object.values(CSS_VAR_MAP)

export function applyThemeToDOM(colors: Record<string, string>, id?: string) {
  const root = document.documentElement
  for (const [k, v] of Object.entries(colors)) {
    const varName = CSS_VAR_MAP[k]
    if (varName) root.style.setProperty(varName, v)
  }
  if (id) {
    root.setAttribute('data-theme', id)
  }
}

export function resetThemeToDefault() {
  const root = document.documentElement
  ALL_VARS.forEach(v => root.style.removeProperty(v))
  root.removeAttribute('data-theme')
}
