# ui-web 设计系统 — DESIGN.md

> **受众**：所有写 UI 的人与 AI agent（三端通用）。
> **定位**：这不是"如何从零实现组件"的手册，而是"如何正确消费 ui-web"的契约。组件永远优先复用，不重造。
> **真相源**：数值只在 [`src/styles.css`](src/styles.css)（Layer 1 色阶 + Layer 2 语义 token）与各端 `src/styles.css` 的覆盖里；本文只写**语义、纪律与判据**，不抄数值（圆角等个别值为方便查阅列出，冲突时以 styles.css 为准）。
> **改动顺序**：改 token → 先改 styles.css，再回填本文；缺 variant → 先扩组件库，再用；本文没覆盖的场景 → 先按 §1 原则判，判完把结论补进来。

**读法**：§1 是判据，遇到本文没写的情况回到这里推；§2–§3 是基础层（token 与版式）；§4–§6 是写页面时最常查的（组件选型、状态、表格表单）；§7 端差异；§8 可访问性与文案；§9 维护；§10 提交前自查。

---

## 1. 原则

1. **橙色是稀缺资源。** 品牌橙只出现在"希望用户按下去"的地方（登录 / 加购 / 下单 / 开店）。它一旦出现在选中态、图标、装饰上，真正的转化按钮就被稀释了。
2. **货架感，不是 SaaS 感。** 中性灰撑全场、分层小圆角、轻阴影、内容密度贴近国内主流电商（参照淘宝）。不做大圆角一刀切、不做宽留白。
3. **复用，不重造。** 任何 UI 元素先找 ui-web 组件，外观走 `variant` / `size`。现有 variant 不够 → 扩展组件库；不在业务侧用 className 盖皮肤、不用带皮肤类的 div 自造假 Card / 假输入框。
4. **一个概念一个出口。** 金额展示、掩码索取、分页条、空态、表格外壳……每个概念在前端只有一个组件承载。第二种写法出现的那一刻，两处就开始漂移。
5. **克制。** 仅浅色模式、字重单屏不超过两种、动效只服务反馈与转场。每一处"多一点"都要能说出它帮用户做了什么决定。

---

## 2. Token

### 2.1 分层

| 层      | 是什么                                                                                            | 谁能写                                  |
| ------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Layer 1 | 原始色阶（`--neutral-*` / `--orange-*` …）                                                        | 只有 ui-web `styles.css` 与端级主题覆盖 |
| Layer 2 | 语义 token（`bg-card`、`text-muted-foreground`、`rounded-lg` …）                                  | 业务代码**只许**用这一层                |
| 端覆盖  | Layer 2 改写：web 在 `apps/web/src/styles.css`，seller / admin 共用 `app-kit/workbench/theme.css` | 只覆盖语义 token，不改组件（见 §7）     |

**仅浅色模式**：全站固定浅色，`light-dark()` 已移除；不引入暗色 token 与 `dark:` 变体。

### 2.2 色彩

**表面族**（中性，撑起信息层级）

| token                             | 用途                   | 纪律                                                       |
| --------------------------------- | ---------------------- | ---------------------------------------------------------- |
| `canvas`                          | 页面地面               | body 底色，必须比 `background` / `card` 深一档             |
| `background` / `card` / `popover` | 页面 / 卡片 / 浮层表面 | 浮层比页面重一档靠 shadow，不靠加深底色                    |
| `sunken`                          | 凹陷区（内嵌块）       | 只用于"比所在表面低一级"                                   |
| `secondary` + `secondary-hover`   | 次级按钮及其 hover 档  | 别拿 `muted` 当按钮底色，也别在调用点加深浅                |
| `muted` / `accent`                | 弱化文字底 / 选中底    | 与 `secondary` 同值是**预留**，勿合并；选中态只用 `accent` |
| `foreground` / `muted-foreground` | 主文字 / 次文字        | 次要说明、占位、装饰图标一律 `muted-foreground`            |

**品牌与行动**

| token                               | 用途                 | 纪律                                                          |
| ----------------------------------- | -------------------- | ------------------------------------------------------------- |
| `primary` + hover / active / subtle | 主 CTA（实色底白字） | 只做转化引导；`primary-subtle` 用于"橙系弱底"（如价格强调底） |
| `cta-alt` + hover / active          | 次 CTA（琥珀金）     | 仅当两个动作并排需要分主次（加购 vs 立即购买）                |

**反馈四色**：`destructive`（红）/ `success`（绿）/ `warning`（琥珀）/ `info`（蓝），每色三件套：实色 `base` + `foreground`，弱底 `subtle` + `subtle-foreground`。

- 状态提示优先用 **subtle 弱底**（浅底深字）；实色底只留给按钮类确认 / 强调。
- **`warning` 是状态，`cta-alt` 是动作**——色近义远，严禁互用。

**结构与焦点**：`border` / `input` / `ring` / `link`。两个描边是两个角色，不是一个值的两次引用——`border` 管结构分隔（卡片、表格、分割线），不承担"这里有个控件"的识别；`input` 管控件边界（input / textarea / select / checkbox …），它是识别控件的**唯一**视觉信息，WCAG 1.4.11 要求 ≥3:1，所以比 `border` 深一档。控件描边由组件自带，业务侧不挑色、不把 `border` 涂到控件上。焦点可见性只靠 `ring`，不用改文字色等方式表达焦点；内联链接走 `link`。

**Sidebar 族**（`--color-sidebar-*`）：sidebar 组件专用，默认与全局一致，端级可覆盖（admin 已覆盖）。

**primary 用色速查**

| 场景        | 用                       | 不用      |
| ----------- | ------------------------ | --------- |
| 转化按钮    | `primary`                | —         |
| 选中 / 激活 | `accent` 或 `foreground` | `primary` |
| 焦点环      | `ring`                   | `primary` |
| 装饰图标    | `muted-foreground`       | `primary` |
| 内联链接    | `link`                   | `primary` |

唯一豁免：**web 端**商品标题 / 店铺名等内容链接 hover 可变 `primary`（淘宝实拍同款转化信号）。仅 C 端、仅 hover；选中态、图标、焦点环仍禁。

### 2.3 形状

圆角全部由 `--radius` 推导，改一处全站联动。刻意偏小、分层明确；**不跨档混用**（按钮不是 lg，卡片不是 md）。

| 档   | 值    | 用在哪             |
| ---- | ----- | ------------------ |
| `sm` | 4.5px | 小徽标、chip       |
| `md` | 6px   | 按钮、输入框等控件 |
| `lg` | 9px   | 卡片、表格外壳     |
| `xl` | 12px  | 弹窗、大浮层       |

### 2.4 海拔

阴影 = 海拔，已染中性色（非纯黑低透明）。**禁止业务侧自写 `box-shadow`。**

| 档      | 语义                     |
| ------- | ------------------------ |
| `sm`    | 卡片静止态               |
| `md`    | 悬停 / 下拉              |
| `lg`    | 弹层                     |
| `lift`  | 拖拽中 / 大型浮层        |
| `float` | 轻量悬浮（如吸顶工具条） |

层叠：吸顶统一 `z-30`；浮层的层级由组件自带，业务侧不写 `z-*` 去"抢"弹窗。

### 2.5 动效

克制，只服务**反馈**与**转场**：

- 交互态过渡 100–200ms（`transition-colors` 一类）
- 浮层进出场：`data-open` 驱动的 animate-in / out
- 表单校验失败：`--animate-shake`（0.4s）
- 页面级转场可用 motion 库
- **程序化滚动只走 `@shop/common` 的 `scrollToTop` / `scrollToElement`**：CSS 里的
  `prefers-reduced-motion` 兜底管不到 JS，`behavior: "smooth"` 写死在调用点就等于绕过兜底，
  门控必须在取值那一层做（各处手抄必然漏一处）
- 装饰性 / 循环动画（登录页氛围、营销位、骨架 shimmer）可以用，但：
    - 必须尊重 `prefers-reduced-motion`（`motion-safe:` 前缀或媒体查询里停掉）
    - 放在背景层，不动用户正在读或要点的内容；工作区（表格、表单、列表）内不放
    - 只动 `transform` / `opacity`，不动布局属性

---

## 3. 字体、版式与间距

**字体**：未接品牌字体，heading 与正文同栈；接入时只改 `--font-sans`。

**字阶**：用 Tailwind 字阶 + 两个补充档——`text-2xs`（13px，辅助说明 / 表单提示）、`text-3xs`（11px，徽章 / 角标）。**禁止任意值字号**（`text-[13px]`）。字重单屏不超过两种。表单的说明与错误文字就是 `text-2xs` 这一档（`field.tsx` / `form.tsx` 已内置，调用点不要抬回 `text-xs`）。

**字距**：负字距（`tracking-tight` 一类）只对拉丁与数字开放。CJK 标题不加负字距——中文没有字母连写，收紧只是让笔画挤成一团，读起来更慢；行高交给 `leading-snug` 这类正值档。

**数字**

- 会跳变的数字（倒计时、库存、页码、统计）一律 `tabular-nums`，防宽度抖动。
- 价格分两种排版，按端分工：
    - **C 端展示位**（商品卡 / 详情 / 收银台等转化锚点）：大数字 + 角分小字分段（`splitFen`），web 走共享 `Price` 组件；不用加粗大字一体。
    - **B 端（seller / admin）数字列**：纯文本 + `tabular-nums`、右对齐。表格里密度优先，分段大字会破坏行对齐。
- 金额展示只走共享出口（`formatMoney` / `Price`），符号跟币种，不手拼 `¥`。

**版心**：`page`（92.875rem，主版心）/ `narrow`（74rem，订单详情等窄页）。写法 `max-w-page` / `max-w-narrow`——Tailwind v4 的 `--container-*` 自动类映射可用（实测与 `max-w-(--container-page)` 等价，产物里就是 `max-width:var(--container-page)`），全仓库统一这一短写法。

**间距**：走 Tailwind 4px 刻度，不写任意值。布局间距用父容器的 `gap-*` 表达，不在子元素上撒 `mt-*` / `mb-*`；同一层级的兄弟间距一致，层级越高间距越大（控件内 < 字段之间 < 区块之间）。密度按端调（§7），不按页面调。

---

## 4. 组件选型

**先查这张表，找不到再考虑扩展组件库。**

| 需要                                           | 用                                                     | 不要                        |
| ---------------------------------------------- | ------------------------------------------------------ | --------------------------- |
| 次要操作                                       | `<Button variant="outline">` / `ghost`                 | className 把 primary 涂灰   |
| 有分页 / 排序 / 筛选 / 行选择 / 列显隐的列表   | `DataTable`（§6.2）                                    | div 网格拼表格              |
| 表单格子、固定小表、跨行合并                   | `Table*` 原语                                          | 同上                        |
| 层级数据（类目树）                             | reui `Tree`（§6.3）                                    | 塞进 DataTable 长出假列     |
| 表单字段                                       | `form.tsx` 的 `XxxField`（§6.1）                       | 自己拼 label + input + 错误 |
| 空态                                           | `Empty`                                                | 自拼灰字居中                |
| 带图 / 标题 / 描述的行与卡（购物车、券、店铺） | `Item*`，行数用它的 `lines` prop（`1/2/3/wrap`）       | 调用点手写 `line-clamp-*`   |
| 加载                                           | 表格用 `DataTableSkeleton`，其余 `Skeleton`            | 堆长条 Skeleton             |
| 掩码值（手机号等）                             | `MaskedValueCell`                                      | 业务侧拼"值 + 查看"按钮     |
| 非表格分页                                     | `paged`（ui-web `lib/utils`）+ app-kit `PaginationBar` | 手写页码                    |
| 图标                                           | `lucide-react`                                         | 其他图标库 / 内联 SVG       |
| 吸顶                                           | Tailwind `sticky` + `z-30`                             | JS 吸顶组件、滚动监听       |

### 4.1 吸顶

直接用 `sticky` 配 `z-30`，不封装组件、不做"吸住才显示阴影 / 背景"的 JS 检测。背景 / 模糊 / 分隔线由内容自带（`bg-background/95 backdrop-blur` + `border-b`），浮起感交给常驻分隔线。多层吸顶时，下层的 `top` 偏移用 `top-*`；需要运行时累计高度时走 CSS 变量（见 4.2）。

### 4.2 动态样式

**动态值的唯一通路是 CSS 变量**：`style` 里只允许 `--x` 键（`shadcn/no-inline-styles` 禁一切普通属性内联样式，运行时包装函数也算"动态"）。

```tsx
import type { CSSVars } from "@shop/ui-web"
const ratioStyle: CSSVars = { "--ratio": r }
<div style={ratioStyle} className="aspect-(--ratio)" />
```

React 的 `CSSProperties` 不认 `--` 键，用 `CSSVars` 补；**不写** `as CSSProperties`（`no-unsafe-type-assertion` 判为不安全断言）。

---

## 5. 状态设计

每个取数区域都要回答四个问题：**加载时长什么样、没数据长什么样、出错长什么样、操作后怎么反馈。**

| 状态     | 做法                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 加载     | 骨架与最终形状一致（表格用 `DataTableSkeleton`）；加载态在调用点二选一（`isPending ? <Skeleton/> : <内容/>`），不把 `isPending` 传进展示组件                                                                                                                                                                                                                                                                                                                  |
| 空       | `Empty` 组件：说清"为什么空"+ 给下一步（如"去发布商品"）；整页无数据时用带图标的 `Empty` 替换整块                                                                                                                                                                                                                                                                                                                                                             |
| 错误     | 交给上层错误边界；表单级 / 服务端错误用 `FormError`，字段错误用 `FieldError`。要露给用户的错误文字只有一个出口：`errorText(toApiError(err), locale, 站点那句兜底)`（`@shop/app-kit`，取文案那条链见 docs/conventions/i18n.md）——写成 `toApiError(err).detail \|\| 兜底` 会被网络层归一出的非空 detail 吃掉站点文案，还会在英文界面印中文。后端把裁定落到具体字段时读 `toApiError(err).errors`（`{ field, message, value? }`）定位输入框，不从 detail 里正则捞 |
| 操作反馈 | 成功 / 失败提示走 subtle 弱底或 toast；乐观更新失败要回滚并提示                                                                                                                                                                                                                                                                                                                                                                                               |
| 禁用     | 用组件的 `disabled`；禁用原因不明显时给 tooltip 或旁注说明为什么不能点                                                                                                                                                                                                                                                                                                                                                                                        |
| 危险操作 | `destructive` + 二次确认弹窗，确认文案写清**后果与影响范围**（§8.2）                                                                                                                                                                                                                                                                                                                                                                                          |

---

## 6. 表单、表格、树

### 6.1 表单

**两层，布局只有一个来源：**

- [`src/components/ui/field.tsx`](src/components/ui/field.tsx) = 展示原语：`Field`（**唯一**布局容器，`orientation` 决定 label 在上方还是固定左列，间距密度住这里）+ 零件 `FieldLabel` / `FieldTitle` / `FieldDescription` / `FieldError` / `FieldSet` / `FieldContent`。
- [`src/components/form.tsx`](src/components/form.tsx) = 接了 TanStack Form 的控件 `XxxField`（`TextField` / `TextareaField` / `SelectField` / `CheckboxField` / `RadioGroupField`）+ 表单级错误 `FormError`。控件内部只组合原语，不另起容器。

规则：

- **分工边界**：文字密度（字号、hover、必填星号、`role="alert"`）住零件；容器间距（gap、方向）住 `Field`。两边都不许在调用点用 `className` 互相盖。
- 自定义 render-prop 场景：`<Field><FieldLabel/>控件<FieldError errors={field.state.meta.errors}/></Field>`。
- label ↔ 控件的 id 用 `React.useId()`，**不用** `field.name`（name 只保证表单内唯一，同页两个表单会撞 id）。
- 校验失败：字段下方给错误文字 + 表单 shake，不只靠变红。

### 6.2 表格

**选型**：见 §4。seller 已有的手写列表（`TableCard`）不强迁；新写的带分页 / 排序的列表一律 `DataTable`。

**结构**

```tsx
<DataTable ...>               {/* provider + 项目默认，不渲染 DOM */}
  <Toolbar />                 {/* 必须在里面：列显隐 / 分页读 useDataGrid()，放外面直接抛错 */}
  {isPending ? <DataTableSkeleton /> : <DataTableCard />}
</DataTable>
```

- 外壳只有 `TableShell`（`rounded-lg` + 描边 + `card` 底）；分页放它的 `footer` 槽，不放卡片外。`DataTableCard` 已把分页条接在这个槽里。
- 分页条与列显隐用 reui 的 `DataGridPagination` / `DataGridColumnVisibility`，中文标签集中在 `DataTable` 的 i18n。
- reui 分页只认总数：`recordCount` 取 `table.getRowCount()`（服务端表取 `rowCount`，客户端表自动回落到全部行），**不传当前页行数**。
- 客户端分页（默认 10 行一页）**必须渲染分页条**，否则第 11 行起静默消失。
- 空态：`DataTable` 的 `emptyContent` 自动包进 `Empty`。

**单元格**

- 列语义走 `TableCell variant`（`strong` 标识列 / `muted` 次要列）；DataTable 写在列定义 `meta: { variant, className }`，`className` 同时作用于表头和单元格。不在 cell 里包 span 模拟字重、弱化色、右对齐。
- 时间列：`formatDateTime`（到分钟）+ `muted` + `tabular-nums`。金额 / 数量：`tabular-nums`，金额右对齐。
- 截断：`TableCell` 基类是 `whitespace-nowrap`，长内容会撑开表格。截断元素必须**块级 + 显式 `max-w-*`**（`block max-w-48 truncate`，配 `title` 露全文）；多行 `line-clamp-*` 还要加 `whitespace-normal`。只写 `truncate`、或把 `max-w-*` 写在行内 span 上都不生效。需要看全文的（地址）用 `whitespace-normal` 换行，不截断。
- 操作列：表头"操作"右对齐；按钮一律 `size="sm"`、`gap-1`；主次用 `ghost` / `outline`，危险动作 `destructive` + 二次确认。
- 每行重复的同名按钮（"查看"）必须用 `subject` 之类的 prop 补出可访问名（§8.1）。

### 6.3 层级列表（Tree）

同一实体自嵌套的结构（类目树）用 reui `Tree` + headless-tree，积木经 `@shop/ui-web` 出口取（见 `components/reui/README.md` tree 一节）。

- **树只负责层级与选中**：改名 / 排序 / 启停 / 子项管理放右侧详情面板。每行塞一组图标按钮，键盘导航与读屏名都会糊掉。
- **排序只做同级**（`sort` 升序 + 创建时间兜底）：`parentId` 创建后不可改，放行跨父级拖拽等于让人看一次"拖过去又弹回来"。上下移与拖拽折成**同一份** sort 更新，只提交真的变了的那几行。
- **禁用不是删除**：查询侧裁剪、可无损恢复；禁用确认里要说清"整支在买家侧不可见"和"子树内有商品会被后端拒绝"。
- 空态 / 加载态同表格。

---

## 7. 三端画像

**差异只通过两件事表达**：① Layer 2 端级覆盖（web 在自己 `src/styles.css`；seller 与 admin 共用 `packages/app-kit/src/shell/workbench/theme.css`，两端不再各自覆盖）；② 下表的使用策略。**禁止为某端复制或魔改组件。**

|              | web 买家端                                                                  | seller 工作台                        | admin 管理端                                                        |
| ------------ | --------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------- |
| 目标         | 转化                                                                        | 履约效率                             | 平台管控                                                            |
| 基调覆盖     | 暖中性；`canvas`（neutral-100）作地面，白卡浮在上面                         | workbench 冷蓝灰 canvas（227°）      | 同 seller（共用 workbench 主题），sidebar 走 canvas                 |
| 密度         | 宽松、大图、货架卡片                                                        | 紧凑表格 + 筛选器                    | 最高密度、只读表格 + 操作列                                         |
| primary 频率 | 高（加购 / 下单 / 登录）                                                    | 低（发布 / 保存等主操作）            | 极低（确认类操作）                                                  |
| 导航         | 顶部导航 + 搜索                                                             | sidebar                              | sidebar                                                             |
| 价格         | `Price` 分段大字                                                            | 纯文本 + `tabular-nums`              | 纯文本 + `tabular-nums`                                             |
| 特有纪律     | 价格与 CTA 是视觉焦点；`cta-alt` 并排区分加购 / 购买；内容链接 hover 可变橙 | 批量操作；乐观更新反馈走 subtle 弱底 | 危险操作（审核拒绝 / 封店 / 禁用账号）必须 `destructive` + 二次确认 |

**判据**：一个视觉需求只出现在一端 → 端覆盖或使用策略；两端以上都要 → 进 ui-web 做 variant。

**响应式定位**：**web（买家端）必须适配手机**（≥320px）；**seller / admin 是桌面工作台，不提供移动端形态**——侧栏固定 270px（rail 96 + panel 176）、壳 `h-svh`，<768px 不保证可用。给 B 端加页面不做移动适配，但也不引入未接线的移动能力（ui-web `Sidebar` 的移动抽屉在 B 端从未挂载）。断点、堆叠与容器查询的口径见 [frontend.md](../../docs/conventions/frontend.md) 的「响应式（三端）」。

---

## 8. 可访问性与文案

### 8.1 可访问性

- 文字对比度 ≥ 4.5:1。token 组合已保证；端覆盖改了 Layer 2 后必须自查。
- **非文字** ≥ 3:1（WCAG 1.4.11）：靠边框才能认出"这是个控件"的那些描边走 `input` 档（结构分隔的 `border` 达不到，见 §2.2）。
- 焦点必须可见：依赖组件默认 `ring`，不删 focus 样式、不用 `outline-none` 了事，也不写 `ring-0` 把替代指示一起删掉。
- 选中 / 激活 / 未读这类状态，除颜色外还要有文字、图标或形状变化承载（见 §8.2 与 `aria-selected` 一类的原生语义）。
- 底层组件来自 BaseUI，WAI-ARIA 行为不手动覆盖。
- 表单 label 文本保持纯净：必填星号走伪元素（`Field` 已实现），不进 textContent。
- 一屏重复出现的同名按钮（每行一枚"查看"）必须靠 `subject` 补出可访问名，读屏才分得清是哪一行。
- 纯图标按钮必须有可访问名（`aria-label` 或视觉隐藏文字）。
- 信息不只靠颜色传达：状态除了色，还要有文字或图标。

### 8.2 文案

- 按钮用动词短语，说清点下去会发生什么（"提交审核"，不写"确定"）；同一动作全站同名。
- 二次确认写**后果 + 影响范围 + 能否撤销**（"禁用后该账号立即无法登录，已登录的会话约 10 分钟内失效，可随时重新启用"），不写"确定要执行此操作吗？"。
- 错误提示说"怎么办"而不只是"错了"；不把后端错误码直接露给用户。
- 空态说"为什么空"并给下一步。
- 文案走 i18n 资源，不在组件里硬编码（细则见 `docs/conventions/i18n.md`）。

---

## 9. 维护

### 9.1 加组件（shadcn CLI）

所有底层组件由 shadcn CLI 生成到 `packages/ui-web`，不手写：

```bash
# 必须用 npx（pnpm dlx 会因 store 里 zod v4 冲突而报错）
# 注意：npm 11+ 会读根 package.json 的 devEngines，在项目目录内跑 npx 直接报 EBADDEVENGINES——
# 需先 cd 到项目外任意目录再执行，--cwd 用绝对路径指向 ui-web
"yes" | npx -y shadcn@latest add <component-name> --cwd /绝对路径/packages/ui-web
# 示例："yes" | npx -y shadcn@latest add button input dialog --cwd packages/ui-web
```

生成后：确认三端 `styles.css` 的 `@source` 已覆盖新文件所在目录（漏了是静默掉样式，不报错）。

### 9.2 扩展既有组件

- 缺外观 → 加 `variant` / `size`，不加 className 口子。
- 新 variant 必须只用 Layer 2 token；需要新语义色 → 先在 styles.css 加 Layer 2 token，再在本文 §2 登记用途与纪律。
- 同一需求出现第二处调用时再抽组件，不为单个页面预造（但也不允许第二处复制第一处）。

### 9.3 改 token

先改 styles.css → 检查三端覆盖是否受影响 → 回填本文对应表格。改圆角 / 阴影档时整站联动，要在三端各看一眼典型页面（商品卡、表格页、弹窗）。

---

## 10. 提交前自查

- [ ] 橙色只出现在转化按钮上（web 内容链接 hover 除外）
- [ ] 没有 Layer 1 色阶、任意值字号 / 间距 / 圆角、自写 `box-shadow`
- [ ] 没有用 className 覆盖组件皮肤；缺外观时扩展的是 ui-web
- [ ] 加载 / 空 / 错误 / 操作反馈四个状态都有着落
- [ ] 危险操作是 `destructive` + 二次确认，文案写了后果与范围
- [ ] 跳变数字与 B 端数字列有 `tabular-nums`
- [ ] 表格截断元素是块级 + `max-w-*`；客户端分页渲染了分页条
- [ ] 重复按钮、纯图标按钮都有可访问名；焦点可见
- [ ] 控件描边走 `input`（≥3:1），没把结构分隔用的 `border` 涂到控件上
- [ ] 程序化滚动走 common 的 `scrollToTop` / `scrollToElement`，没在调用点写死 `behavior: "smooth"`
- [ ] `style` 里只有 `--x` 键
- [ ] 循环 / 装饰动画在 `prefers-reduced-motion` 下会停，且不在工作区内
