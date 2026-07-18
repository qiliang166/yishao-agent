/**
 * 角色 → 操作说明书章节映射
 *
 * 每个角色只能看到自己有权限操作的功能章节。
 * 角色判定优先级：roles 数组 > user_type > permissions
 */

export interface RoleManual {
  /** 说明书封面标题 */
  cover: string
  /** 封面副标题 */
  subtitle: string
  /** 可见章节的 location 列表（按显示顺序） */
  chapters: string[]
}

// ── 章节 location 常量 ──

export const CHAPTERS = {
  home: 'home',
  dashboard: 'dashboard',
  stage1a: 'project-stage-1a',
  stage1b: 'project-stage-1b',
  stage1c: 'project-stage-1c',
  stage2a: 'project-stage-2a',
  stage2b: 'project-stage-2b',
  stage2c: 'project-stage-2c',
  stage3a: 'project-stage-3a',
  stage3b: 'project-stage-3b',
  stage3c: 'project-stage-3c',
  stage4a: 'project-stage-4a',
  stage4b: 'project-stage-4b',
  stage5: 'project-stage-5',
  booklets: 'booklets',
  downloads: 'downloads',
  memberCenter: 'member-center',
  templates: 'templates',
  promptStudio: 'prompt-studio',
  settings: 'settings',
  projSettings: 'proj-settings',
  roles: 'roles',
  members: 'members',
  approval: 'approval',
  stats: 'stats',
  authors: 'authors',
  appendix: 'appendix',
} as const

// ── 章节分组（复用） ──

const CORE_STAGES = [
  CHAPTERS.home,
  CHAPTERS.dashboard,
  CHAPTERS.stage1a, CHAPTERS.stage1b, CHAPTERS.stage1c,
  CHAPTERS.stage2a, CHAPTERS.stage2b, CHAPTERS.stage2c,
  CHAPTERS.stage3a, CHAPTERS.stage3b, CHAPTERS.stage3c,
  CHAPTERS.stage4a, CHAPTERS.stage4b,
  CHAPTERS.stage5,
]

const MEMBER_FEATURES = [
  CHAPTERS.downloads,
  CHAPTERS.booklets,
  CHAPTERS.memberCenter,
]

const ADMIN_TOOLS = [
  CHAPTERS.templates,
  CHAPTERS.promptStudio,
  CHAPTERS.settings,
  CHAPTERS.projSettings,
]

const ADMIN_MANAGEMENT = [
  CHAPTERS.roles,
  CHAPTERS.members,
  CHAPTERS.approval,
  CHAPTERS.stats,
  CHAPTERS.authors,
]

// ── 角色手册定义 ──

const MANUALS: Record<string, RoleManual> = {
  /** 超级管理员：全部功能 */
  super_admin: {
    cover: '超级管理员操作手册',
    subtitle: '涵盖项目管理、五阶段流水线、后台管理、系统配置等全部功能',
    chapters: [
      ...CORE_STAGES,
      ...MEMBER_FEATURES,
      ...ADMIN_TOOLS,
      ...ADMIN_MANAGEMENT,
      CHAPTERS.appendix,
    ],
  },

  /** 内容管理员：项目+阶段+模板+提示词，无用户/角色管理 */
  content_admin: {
    cover: '内容管理员操作手册',
    subtitle: '涵盖项目管理、内容制作流水线、模板与提示词配置',
    chapters: [
      ...CORE_STAGES,
      CHAPTERS.booklets,
      ...ADMIN_TOOLS,
      CHAPTERS.appendix,
    ],
  },

  /** 付费会员：查看项目+下载文件+电子成册+会员中心 */
  paid_member: {
    cover: '付费会员操作手册',
    subtitle: '涵盖项目浏览、文件下载、电子成册、会员中心',
    chapters: [
      ...CORE_STAGES,
      ...MEMBER_FEATURES,
      CHAPTERS.appendix,
    ],
  },

  /** 试用会员：查看项目+电子成册+会员中心（无下载） */
  trial_member: {
    cover: '试用会员操作手册',
    subtitle: '涵盖项目浏览、电子成册、会员中心',
    chapters: [
      ...CORE_STAGES,
      CHAPTERS.booklets,
      CHAPTERS.memberCenter,
      CHAPTERS.appendix,
    ],
  },

  /** 开发体验员：等同于内容管理员 + 会员中心 */
  dev_experience: {
    cover: '开发体验员操作手册',
    subtitle: '涵盖项目管理、内容制作、模板配置、会员功能',
    chapters: [
      ...CORE_STAGES,
      ...MEMBER_FEATURES,
      ...ADMIN_TOOLS,
      CHAPTERS.appendix,
    ],
  },
}

/**
 * 根据用户信息判定当前角色手册。
 * 判定顺序：roles 数组 → user_type → 默认试用会员
 */
export function getRoleManual(user: {
  user_type: string
  roles: string[]
  permissions: string[]
}): RoleManual {
  const { user_type, roles, permissions } = user

  // 角色名判定
  if (roles.includes('超级管理员')) return MANUALS.super_admin
  if (roles.includes('开发体验员')) return MANUALS.dev_experience
  if (roles.includes('内容管理员')) return MANUALS.content_admin
  if (roles.includes('付费会员')) return MANUALS.paid_member
  if (roles.includes('试用会员')) return MANUALS.trial_member

  // user_type 兜底
  if (user_type === 'admin') {
    // admin 但无具体角色 → 给超管手册（通常不会出现）
    return MANUALS.super_admin
  }

  // member 无具体角色 → 按权限推断
  if (permissions.includes('stage5.download')) return MANUALS.paid_member
  return MANUALS.trial_member
}

export default MANUALS
