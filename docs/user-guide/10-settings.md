# 10 — 设置与 API 配置

## 功能位置
左侧导航 → **「全局设置」**（系统级配置）
左侧导航 → **「项目配置」**（ASR/TTS 厂商管理）

## 前置条件
- 拥有至少一个 LLM 提供商的 API Key（如 DeepSeek、通义千问）

## 全局设置

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
- 配置默认 TTS API Key（语音合成）
- TTS 提供商管理在「项目配置」页面的「厂商配置」标签

### 数据
- 显示数据存储路径和占用空间
- **save_path**：全局默认保存路径，项目未设存储路径时使用此路径

### 关于
- 应用名称和版本号
- 「检查更新」按钮

## 项目配置 — 厂商配置

在项目配置页面（/proj-settings）的「厂商配置」标签中管理 ASR 和 TTS 提供商。

### ASR 提供商
语音识别服务提供商，用于视频下载后的语音转写。

#### 添加 ASR 提供商
1. 点击 **「+ 添加 ASR 提供商」**
2. 填写表单：
   - **名称**：如 "DashScope"
   - **API Key**：从对应平台获取
   - **Base URL**：如 `https://dashscope.aliyuncs.com`
   - **模型列表**：用逗号分隔，如 `fun-asr, qwen3-asr-flash`
   - **设为默认**：勾选后作为首选提供商
3. 点击「保存」

#### 测试连接
- 点击 **「测试」** 按钮验证 API Key 和 Base URL 是否可用

#### 支持的 ASR 模型

| 模型 | 说明 |
|------|------|
| fun-asr | DashScope Fun-ASR，高准确率语音识别 |
| qwen3-asr-flash | 兼容模式，快速语音识别 |

### TTS 提供商
语音合成服务提供商，用于口播文案的语音生成。

管理方式与 ASR 提供商完全一致：添加 / 编辑 / 删除 / 测试。

#### 支持的 TTS 模型

| 模型 | 说明 |
|------|------|
| cosyvoice-v3-flash | DashScope CosyVoice，快速语音合成 |
| cosyvoice-v3-plus | DashScope CosyVoice，高质量语音合成 |

## 预期结果
- 添加提供商 → 列表中显示新卡片，API Key 部分隐藏显示
- 测试连接 → 显示成功或失败的提示信息

## 常见错误
| 问题 | 原因 | 解决 |
|------|------|------|
| 测试连接失败 | API Key 错误或 Base URL 不正确 | 核对 Key 和 URL，确认未过期 |
| 401 Unauthorized | API Key 无效 | 重新生成 API Key |
| 模型列表为空 | Base URL 不支持 /models 端点 | 手动输入模型名称即可，不影响使用 |
| ASR 转写无结果 | 提供商未启用或余额不足 | 检查提供商状态和账户余额 |

## 支持的 LLM 提供商
任何兼容 OpenAI API 格式的提供商均可使用：

| 提供商 | Base URL |
|--------|----------|
| DeepSeek | `https://api.deepseek.com/v1` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| Kimi | `https://api.moonshot.cn/v1` |
| 自定义 | 填入你自己的 API 地址 |
