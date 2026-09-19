# ui-web 设计系统 — DESIGN.md

> **受众**：所有写 UI 的人与 AI agent（三端通用）。
> **真相源**：数值真相源是 [`src/styles.css`](src/styles.css)（Layer 1 色阶 + Layer 2 语义 token），本文只写**语义、使用纪律与端画像**——改 token 先改 styles.css，再回填本文。
> **定位**：这不是"如何从零实现组件"的手册，而是"如何正确消费 ui-web"的契约。组件永远优先复用，不重造。

## 0. 使用铁律

1. **复用优先**：任何 UI 元素先找 ui-web 组件，外观走 `variant`/`size` props。禁止 className 覆盖皮肤、禁止原生标签/带皮肤类的 div 自造假 Card、假输入框；现有 variant 不够时**扩展组件库**，不在业务侧 hack。
2. **token 分层**：业务代码只允许 Layer 2 语义类（`bg-card`、`text-muted-foreground`、`rounded-lg`…）；Layer 1 原始色阶（`--neutral-*`/`--orange-*`…）只有 styles.css 与端级主题覆盖可写。
3. **primary 纪律**：品牌橙只留给转化引导（登录/加购/下单/开店）。选中/激活走 `accent` 或 `foreground`，焦点环走 `ring`，装饰图标走 `muted-foreground`，内联链接走 `link`。豁免：web 端商品标题/店铺名等内容链接 hover 可变 primary（淘宝实拍同款转化信号），仅 C 端豁免；选中态、图标、焦点环仍禁。
4. **仅浅色模式**：全站固定浅色，`light-dark()` 已移除；不引入暗色 token 与 `dark:` 变体。
5. **新组件来源**：shadcn CLI 生成到 ui-web（命令见 §9），不手写底层组件；图标一律 `lucide-react`。

## 1. 设计基调

**消费级电商转化风**：中性灰撑全场、结构清楚；品牌暖橙是稀缺资源，只出现在希望用户按下去的地方；货架感——分层小圆角、轻阴影、内容密度贴近国内主流电商（参照淘宝），而不是 SaaS 后台的大圆角宽留白。

## 2. 色彩语义

表面族（中性，撑起信息层级）：

| token                             | 用途                           | 纪律                                          |
| --------------------------------- | ------------------------------ | --------------------------------------------- |
| `canvas`                          | 页面最底                       | body 底色；与卡片形成第一层对比               |
| `background` / `card` / `popover` | 页面 / 卡片 / 浮层表面         | 浮层内容比页面重一档靠 shadow，不靠加深底色   |
| `sunken`                          | 凹陷区（表格头、内嵌块）       | "比所在表面低一级"的场景专用                  |
| `secondary` / `muted` / `accent`  | 次级按钮 / 弱化文字底 / 选中底 | 当前三值相同是预留，勿合并；选中态用 `accent` |
| `foreground` / `muted-foreground` | 主文字 / 次文字                | 次要说明、占位、装饰图标一律 muted-foreground |

品牌与行动：

| token                           | 用途                 | 纪律                                                                                            |
| ------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| `primary` + hover/active/subtle | 主 CTA（实色底白字） | 只做转化引导；primary-subtle 用于"橙系弱底"场景（如价格强调底）                                 |
| `cta-alt` + hover/active        | 次 CTA（琥珀金）     | 仅当两个动作并排需区分主次（加购 vs 立即购买）；**它表示动作，不是状态色**，与 warning 严禁混用 |

反馈四色，每色三件套（实色 base+foreground / 弱底 subtle+subtle-foreground）：

- `destructive`（红）/ `success`（绿）/ `warning`（琥珀）/ `info`（蓝）
- 状态提示优先用 **subtle 弱底**（浅底深字），实色底只留给按钮类确认/强调；
- `warning` 表示状态，`cta-alt` 表示动作，两者色近义远。

结构与焦点：`border` / `input` / `ring` / `link`。描边一律 `border`，焦点可见性靠 `ring`，别用改文字色等方式表达焦点。

Sidebar 族（`--color-sidebar-*`）：sidebar 组件专用语义，默认与全局一致，端级可覆盖（admin 已覆盖）。

## 3. 形状与海拔

**圆角阶梯**（全部由 `--radius` 推导，改一处全站联动）：

| 档   | 实际值 | 用在哪             |
| ---- | ------ | ------------------ |
| `sm` | 4.5px  | 小徽标、chip       |
| `md` | 6px    | 按钮、输入框等控件 |
| `lg` | 9px    | 卡片               |
| `xl` | 12px   | 弹窗、大浮层       |

刻意偏小、分层明确，避免 SaaS 式大圆角一刀切；不要跨档混用（按钮不是 lg，卡片不是 md）。

**阴影 = 海拔**，五档语义：`sm` 卡片静止态 → `md` 悬停/下拉 → `lg` 弹层 → `lift` 拖拽中/大型浮层 → `float` 轻量悬浮（如吸顶工具条）。阴影已染中性色（非纯黑低透明），禁止业务侧自写 box-shadow。

**吸顶/不随页面滚动**：直接用 Tailwind 内置类 `sticky`（`position: sticky`）配 `z-*`（盖住下层内容，统一 `z-30`），不封装 JS 组件、不做「吸住才显示阴影/背景」的 JS 检测。top 偏移用 `top-*` 或内联 `style`（低层吸顶传上层累计高度）；背景/模糊/分隔线由各自内容自带（`bg-background/95 backdrop-blur` + `border-b`），吸住后的浮起反馈交给常驻分隔线，不依赖吸住态。`sticky` 本身已是原语，无需再包一层工具类。

## 4. 字体与版式

- 未接品牌字体，heading 与正文同栈；接入时只改 `--font-sans`。
- 版心：`page`（92.875rem，主版心）/ `narrow`（74rem，订单详情等窄页）。消费方式 `max-w-(--container-page)`——Tailwind v4 的 `--container-*` 自动类映射有 bug，勿用 `max-w-container-page`。
- 字重单屏不超过两种；价格用大数字+角分小字的分段排版（`splitFen`），不用加粗大字一体。
- 价格排版分工：`splitFen` 分段用于 **C 端展示位**（商品卡/详情/收银台等转化锚点，web 端有共享 `Price` 组件）；**B 端（seller/admin）数字列走纯文本 + `tabular-nums`**——表格里密度优先，分段大字反而破坏行对齐。
- 会跳变的数字（倒计时、库存、页码、统计）一律 `tabular-nums`，防数字宽度抖动。
- 字阶补充档：`text-2xs`（13px，辅助说明/表单提示）、`text-3xs`（11px，徽章/角标），禁止再写 `text-[13px]` 类任意值字号。

## 5. 动效

克制、只服务反馈与转场：交互态过渡 100–200ms（`transition-colors` 类）；浮层进出场用 `data-open` 驱动的 animate-in/out；表单校验失败用 `--animate-shake`（0.4s）；页面级转场可用 motion 库。禁止装饰性长动画与循环动画（骨架屏 shimmer 除外）。

## 6. 端画像

**差异的承载方式**：三端共享 ui-web 组件与 Layer 1 色阶，端差异只通过两件事表达——
① 端级 Layer 2 覆盖（各 app `src/styles.css` 的 `:root`，仅覆盖语义 token，不改组件）；
② 使用策略（下表）。禁止为某端复制/魔改组件。

|                  | web 买家端                                       | seller 工作台                        | admin 管理端                                             |
| ---------------- | ------------------------------------------------ | ------------------------------------ | -------------------------------------------------------- |
| 目标             | 转化                                             | 履约效率                             | 平台管控                                                 |
| 当前基调覆盖     | 默认（暖中性）                                   | 冷蓝灰 canvas（227°）                | 暖灰 canvas（60°）+ sidebar 白                           |
| 密度             | 宽松、大图、货架卡片                             | 紧凑表格 + 筛选器                    | 最高密度、只读表格 + 操作列                              |
| primary 出现频率 | 高（加购/下单/登录）                             | 低（发布/保存等主操作）              | 极低（确认类操作）                                       |
| 导航             | 顶部导航 + 搜索                                  | sidebar（sidebar 组件族）            | sidebar                                                  |
| 特有纪律         | 价格与 CTA 是视觉焦点；cta-alt 并排区分加购/购买 | 批量操作、乐观更新反馈走 subtle 弱底 | 危险操作（审核拒绝/封店）必须 destructive + 二次确认弹窗 |

## 7. 可访问性

- 文字对比度 ≥ 4.5:1（token 组合已保证，自定义覆盖后需自查）；
- 焦点必须可见：交互元素依赖组件默认 `ring`，不删除 focus 样式；
- 表单 label 文本保持纯净：必填星号走伪元素（Field 组件已实现），不进 textContent；
- 底层组件来自 BaseUI，WAI-ARIA 行为不要手动覆盖。

## 8. Do / Don't

| ✅                                                          | ❌                               |
| ----------------------------------------------------------- | -------------------------------- |
| `<Button variant="outline">` 表达次要操作                   | 用 className 把 primary 按钮涂灰 |
| 选中态 `bg-accent`                                          | 选中态用 primary 橙              |
| 状态提示 `bg-warning-subtle text-warning-subtle-foreground` | 状态提示用 cta-alt 琥珀金        |
| 浮层 `rounded-xl shadow-lg`                                 | 自写 box-shadow / 大圆角         |
| 缺组件 → 扩展 ui-web                                        | 业务内包一层 div 假装是新组件    |

## 9. 组件生成（CLI）

所有组件由 shadcn CLI 生成到 `packages/ui-web`，不手写底层组件：

```bash
# 必须用 npx（pnpm dlx 会因 store 里 zod v4 冲突而报错）
# 注意：npm 11+ 会读根 package.json 的 devEngines，在项目目录内跑 npx 直接报 EBADDEVENGINES——
# 需先 cd 到项目外任意目录再执行，--cwd 用绝对路径指向 ui-web
"yes" | npx -y shadcn@latest add <component-name> --cwd /绝对路径/packages/ui-web
# 示例："yes" | npx -y shadcn@latest add button input dialog --cwd packages/ui-web
```
