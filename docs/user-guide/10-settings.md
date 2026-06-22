# 10 — 设置与 API 配置

## 功能位置
左侧导航 → **「设置」**

## 前置条件
- 拥有至少一个 LLM 提供商的 API Key（如 DeepSeek、通义千问）

## 标签页说明

### LLM 配置
管理大模型提供商配置。

#### 添加提供商
1. 点击 **「+ 添加提供商」**
2. 填写表单：
   - **名称**：如 "DeepSeek"、"通义千问"
   - **API Key**：从对应平台获取
   - **Base URL**：默认已填入常见平台的地址
   - **模型列表**：用逗号分隔，如 `deepseek-chat, deepseek-reasoner`
3. 点击「保存」

#### 测试连接
- 在提供商卡片上点击 **「测试连接」**
- ✅ 绿色：连接正常，会显示可用模型列表
- ❌ 红色：连接失败，检查 API Key 和 Base URL

#### 编辑 / 删除
- **编辑**：点击卡片上的编辑按钮，修改后保存
- **删除**：点击删除按钮，确认后移除

### TTS 配置
- 配置 DashScope API Key（用于语音合成，后续版本开放）
- 当前可先填入与 LLM 配置中相同的 Key

### 数据
- 显示数据存储路径和占用空间

### 关于
- 应用名称和版本号
- 「检查更新」按钮（后续版本开放）

## 预期结果
- 添加提供商 → 列表中显示新卡片，API Key 部分隐藏显示
- 测试连接 → 显示成功或失败的提示信息

## 常见错误
| 问题 | 原因 | 解决 |
|------|------|------|
| 测试连接失败 | API Key 错误或 Base URL 不正确 | 核对 Key 和 URL，确认未过期 |
| 401 Unauthorized | API Key 无效 | 重新生成 API Key |
| 模型列表为空 | Base URL 不支持 /models 端点 | 手动输入模型名称即可，不影响使用 |

## 支持的 LLM 提供商
任何兼容 OpenAI API 格式的提供商均可使用：

| 提供商 | Base URL |
|--------|----------|
| DeepSeek | `https://api.deepseek.com/v1` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Kimi | `https://api.moonshot.cn/v1` |
| 自定义 | 填入你自己的 API 地址 |
