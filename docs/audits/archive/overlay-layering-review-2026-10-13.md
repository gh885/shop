# 浮层层级审查：z-index 与渲染顺序

> **归档说明（2026-10-17）**：本份是**改造前的诊断快照**，下文「全站只有一个 `z-50`、toast 恒在所有弹窗之下」的结论**已被取代**——现已落地为四档 z-index token（`z-sticky/raised/chrome/overlay/toast`，见 [DESIGN.md §2.4](../../../packages/ui-web/DESIGN.md)）+ `pnpm z-index:guard` 护栏（脚本实际路径 `scripts/design/z-index-guard.mjs`）。留此仅存机制层面的 **why**（Base UI 不自管 z-index、同档位靠 portal append 顺序、`container` prop 压过 `parentPortalNode` 故不能按桶化 portal、`DialogContent` 的 transform→containing-block 约束），这些理由 DESIGN.md 只给规则不给论证。

> 视角：把三端所有浮层（dialog / alert-dialog / sheet / drawer / popover / dropdown-menu /
> select / combobox / cascader / tooltip / navigation-menu / toast）的层级口径拉到一起看，
> 找出「谁盖住谁」不成立的地方。
> 结论先说：**全站浮层只有一个 z 档位（`z-50`），层级完全由 portal 挂载顺序隐式决定；
> 唯一一处顺序倒挂是 toast —— 它恒在所有弹窗之下。**

---

## 1. 机制：层级是怎么定下来的

底层是 `@base-ui/react@1.8.0`。三条实测事实决定了整套行为：

| #   | 事实                                                                                                      | 证据                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Base UI 不管理 z-index**                                                                                | 全包只有 `slider/thumb/SliderThumb` 用到 `zIndex`；`Popup` / `Positioner` / `Portal` 都不写                                                        |
| 2   | **每个 Portal 自己往 `document.body` 末尾 `appendChild` 一个 `div[data-portal]`**，没有共享容器、没有分桶 | `floating-ui-react/components/FloatingPortal.mjs` 的 `useFloatingPortalNode`：`resolvedContainer = container ?? parentPortalNode ?? document.body` |
| 3   | **嵌套的 Portal 会落进父 Portal 的节点里**（`parentPortalNode` 优先于 body）                              | 同上                                                                                                                                               |

由此得到两条推论，后面所有判断都建立在它们上面：

- **同 z 值 ⇒ 绘制顺序 = portal 挂载顺序 = 打开顺序**（后来的赢）。
- **嵌套浮层自动正确**：弹窗里开的 Select/Popover，其 portal 会嵌进弹窗的 portal 节点、排在弹窗内容之后 ⇒ 永远压在弹窗之上。这一层不需要人管。

再看 z 值的分布（`grep -rn "z-50" packages/ui-web/src apps/*/src`，24 处）：

| 档           | 值                                         | 谁在用                                                                                                                                       |
| ------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 浮层         | `z-50`                                     | dialog(遮罩+内容) / alert-dialog / sheet / popover / dropdown-menu / select / combobox / tooltip / navigation-menu / cascader / toast 视口   |
| 吸顶（壳层） | `z-40`                                     | `topbar.tsx:33`、`BackToTop.tsx:28`、`data-grid.tsx:1019` 表头、`data-grid-cell-selection.tsx:2428` 批量条                                   |
| 吸顶（内容） | `z-30`                                     | `HomeHeader.tsx:18`、`RecommendBar.tsx:80/92`、`DetailSections.tsx:143`、`BasicStep.tsx:347`、`ShippingTemplatePage.tsx:354`、`tree.tsx:182` |
| 组件内       | `z-20` / `z-10` / `z-[35]` / `z-1` / `z-0` | sidebar 拖拽柄、表格滚动条、pin 单元格 30、单元格编辑器 `z-[35]`、calendar、tree                                                             |

**没有任何 z-index token**：`packages/ui-web/src/styles.css` 里没有 `--z-*`，全仓 CSS 里唯一的
`z-index` 是登录页装饰噪声的 `-1`（`apps/seller/src/styles.css:44`）。也就是说这套档位只活在
24 处 Tailwind 类名和 `DESIGN.md:98` 的一句话里。

`DESIGN.md:98` 的规定是：

> 层叠：吸顶统一 `z-30`；浮层的层级由组件自带，业务侧不写 `z-*` 去"抢"弹窗。

这句话有三处对不上现状：`topbar.tsx` 吸顶用的是 `z-40`；表格吸顶也是 `z-40`；业务侧确实写了
`z-*`（3 处，见 §3）。而且**这条规则没有任何门禁**——`shadcn/no-arbitrary-values` 只拦 `z-[35]`
这种任意值，`z-50` 是合法类名，业务侧随便写。

---

## 2. Bug 1（严重）：Toast 恒被弹窗压住

### 现象

弹窗（dialog / alert-dialog / sheet）打开期间弹出的 toast，会：

1. 被遮罩压暗并模糊 —— `dialog.tsx:49` 的遮罩是 `fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs`；
2. **点不动** —— Base UI 的遮罩（`utils/InternalBackdrop.mjs`）只设 `position/inset/userSelect`，
   **没有 `pointer-events: none`**；`DialogPortal` 只在关闭时给遮罩加 `inert`。所以点 toast 的
   关闭按钮或 Action，实际是"点了遮罩"⇒ 弹窗被关掉；
3. **读屏听不到** —— 模态弹窗用 `markOthers(body 的其他子节点, { ariaHidden: modal })`
   （`floating-ui-react/components/FloatingFocusManager.mjs:339` → `utils/markOthers.mjs:147`），
   toast 的 portal `div` 是 body 的直接子节点 ⇒ 被写上 `aria-hidden="true"`。

> **撤回（实施阶段查证）**：第 3 条**不成立**，是我读源码时漏了一层。
> `markOthers` 在收集要隐藏的元素**之前**，会把 `body.querySelectorAll('[aria-live]')`
> 的结果并入 keep 集合（`utils/markOthers.mjs:86-88` 的 `ariaLiveElements`），
> 并把它们的**祖先**一起保住（`buildKeepSet` 向上遍历）。
> 而 Base UI 的 `ToastViewport` 默认就带 `aria-live="polite"`
> （`toast/viewport/ToastViewport.mjs` 的 `defaultProps`），
> 本仓库的 `ToastViewport` 只覆盖了 `className` / `data-slot`，没动它。
> ⇒ **toast 从没被 `aria-hidden`，读屏一直听得到**。
> 顺带查清：`data-base-ui-inert` 这个 marker 全仓只有 `InternalBackdrop` 自己写，
> 没有任何读取方，纯标记、无行为。
> 所以 Bug 1 的真实后果只有前两条（视觉压暗 + 点击落到遮罩上）。

### 根因

`Toaster` 挂在根布局、**首屏就渲染**：

- `apps/web/src/routes/__root.tsx:108`
- `apps/seller/src/routes/__root.tsx:45`
- `apps/admin/src/routes/__root.tsx:43`

而 `ToastPortal` → `FloatingPortalLite` **没有 `mounted` / `open` 门控**（对比 `DialogPortal`
是 `if (!(mounted || keepMounted)) return null`）。于是：

```
document.body 的子节点顺序
├── #root                      ← 全部应用 DOM
├── div[data-portal]  ← Toaster（首屏挂载，永远第一个浮层节点）
├── div[data-portal]  ← 之后每打开一个 dialog/sheet/alert-dialog 追加一个
└── div[data-portal]  ← …
```

三者同为 `z-50`、同在根层叠上下文 ⇒ **后挂载者赢 ⇒ 弹窗整体压在 toast 之上**。
而且这个顺序是**稳定的**：toast 的 portal 首屏就位，此后任何新弹窗都排在它后面。

### 触发场景（代码里已明确设计过）

`packages/ui-web/src/components/confirm.tsx:89-90` 写着：

> 失败保持打开：错误提示已由全局 mutation 反馈弹出，用户可重试或取消

也就是 `confirm({ action })` 的 action reject 时，**确认弹窗刻意保持打开 + 错误 toast 同时出现**
——这正是 toast 必被压住的一刻。同类场景还有：

- `GlobalLoginDialog` 打开期间的一切 toast（登录失败提示 / 复制成功提示）；
- 任何"弹窗内提交 → mutation 反馈"的路径（三端所有表单弹窗）；
- `Sheet`（移动端侧边栏）打开时的 toast。

### 一个值得注意的不对称

两个全局宿主都挂在根布局（`<Toaster />` 与 `<ConfirmDialogHost />` 并排），但结果完全相反：

- `ConfirmDialogHost` **按需挂载**（`confirm.tsx:139` `if (!request) return undefined`）
  ⇒ portal 最后 append ⇒ **永远最上**，这个是对的；
- `Toaster` **常驻挂载** ⇒ portal 最先 append ⇒ **永远最下**，这个就是 bug。

### 处置（2026-10-13 已实施）

**实际做法：给 toast 一个高于浮层的专属档，并把层叠落成 Tailwind 官方 token。**

```diff
// packages/ui-web/src/styles.css（@theme 内）
+ --z-index-sticky: 30;
+ --z-index-chrome: 40;
+ --z-index-overlay: 50;
+ --z-index-toast: 60;

// packages/ui-web/src/components/ui/toast.tsx
- "pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto w-auto max-w-sm outline-none",
+ "pointer-events-none fixed inset-x-4 top-4 z-toast mx-auto w-auto max-w-sm outline-none",
```

**这里没有用 `@utility` 自造**：Tailwind v4 里 `--z-index-*` 就是 `z-*` 工具的官方命名空间
（源码 `functional("z", { themeKeys: ["--z-index"] })`），所以 `z-sticky` / `z-chrome` /
`z-overlay` / `z-toast` 是货真价实的 utility，不需要绕。

#### 为什么没做「portal 分层根」

原计划是把浮层按层分桶到不同的 portal 容器（Bytebase 那种 `layer.ts`）。实施时查证到一条
硬约束，否掉了它：

```js
// @base-ui/react/floating-ui-react/components/FloatingPortal.mjs
const resolvedContainer =
    (containerProp && (isNode(containerProp) ? containerProp : containerProp.current)) ??
    parentPortalNode ??
    document.body
```

**`container` 的优先级高于 `parentPortalNode`。** 也就是说，一旦给「下拉/select」这类组件的
Portal 传了 `container`，「弹窗里开下拉」的嵌套关系就被拆掉——下拉会跑到 popover 层的根节点里，
而那个根节点的 z 低于 dialog 层 ⇒ **嵌套浮层反而掉到弹窗下面**，比现状更糟。

要保住嵌套，就得让「已经在某个 portal 里」的组件不传 container——而这件事 Base UI 没有公开
接口（`usePortalContext` 不在包的导出面上），只能自己用一层 React context 模拟。
**收益（防住业务侧乱写 z）已经被 `z-index:guard` 门禁拿到了，风险却是回归嵌套浮层排序**，
所以不做。等 Base UI 提供「只在无父 portal 时生效」的容器语义，或者等我们在浮层上真的遇到
「树内高 z 盖住弹窗」的实例，再回来评估。

#### 实际改动清单

| 文件                                                                                                                                                                                            | 改动                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui-web/src/styles.css`                                                                                                                                                                | `@theme` 加五档 `--z-index-*`（含为什么 toast 只能靠数值翻过来、为什么需要 `z-raised` 的注释）                               |
| `packages/ui-web/src/components/ui/toast.tsx`                                                                                                                                                   | 视口 `z-50` → `z-toast`（**bug 修复本体**）                                                                                  |
| `packages/ui-web/src/components/ui/{dialog,sheet,alert-dialog,popover,tooltip,dropdown-menu,select,combobox,navigation-menu}.tsx`                                                               | 18 处 `z-50` → `z-overlay`（单一来源，值不变）                                                                               |
| `packages/ui-web/src/components/topbar.tsx`                                                                                                                                                     | 吸顶 `z-40` → `z-chrome`（原先违反 DESIGN.md「吸顶统一 z-30」）                                                              |
| `packages/ui-web/src/components/data-table/table-shell.tsx`                                                                                                                                     | 加 `isolate`：表内 `z-40`/`z-[35]`/`30` 不再和页面吸顶抢数值空间                                                             |
| `apps/web/src/{layout/BackToTop,layout/RouteProgressBar,home/HomeCategoryNav,home/HomeHeader,home/RecommendBar,products/detail/DetailSections,products/detail/Gallery}.tsx`                     | 裸 `z-30`/`z-40`/`z-50` → `z-sticky`/`z-chrome`/`z-overlay`                                                                  |
| `apps/seller/src/{product/create/basic/BasicStep,product/create/basic/ProductEditor,product/create/basic/SkuGridEditor,product/create/category/CategoryStep,shipping/ShippingTemplatePage}.tsx` | 同上                                                                                                                         |
| `packages/ui-web/DESIGN.md` §2.4                                                                                                                                                                | 把「吸顶统一 z-30」那句换成五档表 + 三条纪律（业务侧不写裸数值 / 内部相对层级用 `isolate` 关起来 / 弹窗内浮层必须走 portal） |
| `scripts/z-index-guard.mjs` + `.test.mjs`                                                                                                                                                       | 新门禁：`apps/<app>/src` 禁裸数值层叠（≥30、任意值、内联 `zIndex` ≥30），放行五个 token 与 30 以下                           |
| `lefthook.yml` / `package.json` / `.github/workflows/ci.yml`                                                                                                                                    | 门禁接进 pre-commit（`pnpm z-index:guard`，~10ms）与 CI 的 `frontend` job                                                    |
| `apps/web/src/home/category-nav-stacking.ts` + `.test.mjs`（见 §4.1）                                                                                                                           | 竖展容器的层叠自检：dev 下扫祖先是否创建了层叠上下文，把静默失效变响                                                         |
| `apps/web/src/home/HomeCategoryNav.tsx` / `apps/web/src/routes/index.tsx`                                                                                                                       | 把「祖先不许创建层叠上下文」写成显性不变量（推理链在代码里）                                                                 |
| `apps/web/vite.config.ts`                                                                                                                                                                       | `domTests` 加一条 `.ts`（祖先遍历要真 DOM 才测得动，否则是假绿）                                                             |
| `packages/config/oxlint.config.ts`                                                                                                                                                              | `NO_RESTYLE_ALWAYS_ALLOWED` 加 `z-*`（`no-restyle` 的语法表不认自造 token，`z-chrome` 会被判红）                             |
| `apps/web/src/home/HomeHeader.tsx`                                                                                                                                                              | 顶栏 `z-sticky` → `z-chrome`（**补漏**：它必须压住竖展面板，见 §4.1 第 3 条）                                                |
| `apps/web/src/home/HomeCategoryNav.tsx`（面板）                                                                                                                                                 | `z-overlay` → `z-raised`（夹在推荐条 30 与顶栏 40 之间）                                                                     |
| `apps/web/src/layout/RouteProgressBar.tsx`                                                                                                                                                      | `z-chrome` → `z-overlay`（顶栏提到 40 后，它必须再高一档才不被顶栏盖住）                                                     |

**没动的**：`packages/ui-web/src/components/reui/**`（cascader / data-grid 里的 `z-50` / `z-40` / `z-[35]`）。
它们是第三方 vendored（README 明写「尽量不动」、可重装），且值与 token 等价（都是 50/40），
渲染结果不变。

**仍然待验证（低置信，需真实浏览器）**：商详 `Gallery` 放大预览与 `DetailSections` 吸顶条同为 `z-sticky`，
DOM 上后者更靠后 ⇒ 左栏滚过一屏后再 hover 主图时，预览浮层顶部约 76px 可能被吸顶条盖住。
本次刻意保持原值（不改变现有观感），要修的话应把预览浮层提到 `z-chrome`。

---

## 3. Bug 2（中）：`z-40` 与「吸顶统一 z-30」冲突，且和表格吸顶同档

`DESIGN.md:98` 规定吸顶统一 `z-30`，但：

- `packages/ui-web/src/components/topbar.tsx:33`：`sticky top-0 z-40`（壳层顶栏）；
- `packages/ui-web/src/components/reui/data-grid/data-grid.tsx:1019`：
  `headerSticky: "sticky top-0 z-40 …"`，注释说明它是为了压住 pin 单元格的 `zIndex 30`；
- `apps/web/src/layout/BackToTop.tsx:28`：`fixed bottom-6 right-6 z-40`。

**现状为什么暂时没炸**：seller/admin 工作台的外层是 `h-svh` 不滚动、`main` 内滚
（`apps/seller/src/layout/AppShell.tsx`），顶栏其实滚不到；`fullWidth` 页（发布流程）又刻意把顶栏
设成 `sticky={false}`。所以"顶栏 vs 表格头"这对同档位的冲突，是靠**每个页面记得让位**维持的。

**一旦前提变化就会现形**：把某个容器从内滚改成窗口滚、或给工作台加一个窗口滚的页面，
表格吸顶头（`z-40`，DOM 更靠后）就会盖住壳层顶栏（`z-40`）——同档位下后来者赢。
`BackToTop z-40` 与表格批量条 `z-40`（`data-grid-cell-selection.tsx:2428`，居中贴底）窄屏下也会挤在一起。

### 修复方向

1. **把"内部相对层级"关进层叠上下文**：给表格的滚动容器（或 `TableShell`）加 `isolate`，
   让它内部的 `z-40` / `z-[35]` / `z-30` 不再和页面级吸顶抢同一段数值空间。
   这是根治——表格只需要"在表格内部最上"，不需要"在全站最上"。
2. **把档位写成 token，并同步改 DESIGN.md 那句话**：

    | token         | 值  | 语义                                 |
    | ------------- | --- | ------------------------------------ |
    | `--z-sticky`  | 30  | 内容区吸顶（页签、区块导航、推荐条） |
    | `--z-chrome`  | 40  | 壳层（顶栏、悬浮工具）               |
    | `--z-overlay` | 50  | 所有浮层                             |
    | `--z-toast`   | 60  | 通知（必须高于浮层）                 |

3. `topbar.tsx` 与 `data-grid.tsx` 改用 token，`DESIGN.md:98` 由"吸顶统一 z-30"改为上表。

---

## 4. Bug 3（中）：业务侧手写 `z-50`，两处都靠"恰好"成立

`DESIGN.md` 明令"业务侧不写 `z-*` 去抢弹窗"，实际有 3 处：

**(a) `apps/seller/src/product/create/basic/SkuGridEditor.tsx:194`**

```tsx
<div className={cn(fullscreen && "fixed inset-0 z-50 overflow-auto bg-background p-6")}>
```

用 `z-50` 手搓了一个全屏模态。方向恰好是对的（它在树内，永远在所有 portal 浮层之下），
但它同时意味着：**以后任何新增的 portal 浮层都会盖住它**，而它自己又靠 `z-50` 盖住 seller 顶栏
（发布流程页顶栏是 `static`）。这条约束没有任何地方写下来。

**(b) `apps/web/src/home/HomeCategoryNav.tsx:156`**

```tsx
<div className="no-scrollbar absolute inset-x-0 top-0 z-50 max-h-50 … group-hover/navigation-menu:max-h-125 …">
```

hover 竖展容器（最高 500px）。它之所以压得住下面的 `RecommendBar z-30`，**只是因为祖先链上
恰好没有任何 z-index / `transform` / `isolate`** —— 所以这个 `z-50` 落在根层叠上下文里。
一旦有人给 `<section>`（`apps/web/src/routes/index.tsx:74`）或页面容器加上 `z-*` / `isolate` /
`transform`，这个面板立刻被 `RecommendBar` 盖住（`z-50` 会被困在祖先的层叠上下文内）。

> 同一页里的 mega 面板走 `NavigationMenuContent` 的 portal，天然免疫——**两类浮层要分开判断**
> （这条在 `.workbuddy-ai/memory/2026-10-13.md` 已经踩过一次）。

**(c) `apps/web/src/layout/RouteProgressBar.tsx:34`**：`z-50` 但**在树内**，所以它永远在所有
portal 浮层之下 —— 弹窗打开时进度条会被遮罩压暗。纯装饰 + `pointer-events-none`，影响很小，
但同样说明"树内 `z-50` ≠ 浮层层级"。

### 处置

- (a) 全屏 SKU 编辑器：`z-50` → `z-overlay`（值不变，但语义明确、纳入 token）。**没改成真 `Dialog`**——
  它是"就地全屏"而不是"浮层"，改 `Dialog` 会连布局一起换，属于另一个改动。
- (b) 竖展容器 `z-50` → `z-overlay`，并把「祖先不许创建层叠上下文」这条隐式依赖
  **写成显性不变量 + 加 dev 自检**（详见下一节）。

### 4.1 竖展容器：被夹在推荐条与顶栏之间

这是本次唯一一条「知道脆弱但没有干净修法」的地方，推理链留档：

1. 展开态最高 500px（`max-h-125`），而这一列在 hero 里只有 200px（`h-50`，与同行 banner 对齐）
   ⇒ **面板必然越过 hero 下沿**，伸进 `Feed` 区——那里第一条就是 sticky 的 `RecommendBar`；
2. `RecommendBar` 是 `z-sticky`(30)，它**必须**压在 hero 内容之上（滚动时 hero 从它下面过，
   hero 下沿与 sticky 带在滚动前 248px 内是重叠的）⇒ 面板得在它**之上**；
3. 顶栏是 `z-chrome`(40)，它**必须**压住面板——滚动时面板要从顶栏底下过。
   这条是**实测补上的**：原先面板用 `z-overlay`(50) 高于顶栏(30)，而 `--home-header-height`
   只有 4rem ⇒ 滚动一点点面板就压住顶栏的 logo（截图可见，视觉上像"面板飘在顶栏上面"）
   ⇒ 面板得在它**之下**；
4. 于是面板被夹在中间，取新档 `z-raised`(35)：**推荐条 30 < 面板 35 < 顶栏 40**。
   其中"压过推荐条"这一半要求面板**逃出 hero 的层叠上下文**
   （"落在顶栏之下"那一半不受祖先影响：顶栏的 40 高于面板所在的任何层）；
5. CSS 里能逃出祖先层叠上下文的只有 **portal** 与 **top layer**，而这个面板装着**首屏导航**：
    - portal：`createPortal` 在服务端不渲染 ⇒ SSR 首屏吐不出这些链接（首页是 SEO 主页面），
      要救就得「挂载后才 portal」的两段渲染，多一次重挂载；
    - top layer（`popover` 属性）：`[popover]` 未展开时 UA 样式是 `display: none`
      ⇒ 收起态默认不可见；且 top layer 在**所有** portal 浮层之上 ⇒ 会盖住弹窗，
      而一个 hover 展开的导航列本来就不该是 top-layer 公民。
      两条代价都大于这条依赖本身。

**所以结论是：保持现状（hero 内的 `absolute` + `z-raised`），把它依赖的前提当成不变量来守。**
守法是两道：

- 代码里写清（`home/HomeCategoryNav.tsx` 的 `HomeCategoryNavContent` 上方、`routes/index.tsx` 的 hero 处）；
- **dev 自检**：`home/category-nav-stacking.ts` 在挂载时扫一遍祖先，命中
  `isolation` / `transform` / `translate` / `rotate` / `scale` / `filter` / `backdrop-filter` /
  `will-change` / `perspective` / `contain` / `opacity<1` 就在控制台告警。
  这条依赖**既测不了也门禁不了**（`z-index:guard` 拦不住"给 section 加个 isolate"），
  而失效是静默的（面板照常展开，只是被压在下面），所以只能靠运行时自检把它变响。

> **实测口径**：`stackingContextReason` 的「非命中值」表里，`isolation` 的反面是 `auto`
> **不是** `isolate` —— 写反会让自检对最可能的元凶永不触发。这条是被单测抓出来的
> （`category-nav-stacking.test.ts` 专门留了一条反向用例）。
> 祖先遍历那一步用注入 `readStyle` 的方式在真 DOM 上测（jsdom 的 `getComputedStyle`
> 对这批属性一律读回空串，不注入就只能得到一条"永远通过"的假绿）。

- (c) `RouteProgressBar` `z-50` → `z-chrome`（它是装饰，不该占浮层档）。

---

## 5. 防回归

1. **门禁已落地**：`pnpm z-index:guard`（`scripts/z-index-guard.mjs`，13 条单测）。
   禁 `apps/<app>/src` 里的裸数值层叠（≥30、`z-[…]`、内联 `zIndex≥30`），
   放行五个 token 与 30 以下。接 pre-commit（tags `[arch]`）+ `ci.yml` 的 `frontend` job。
   **实测活性**：注入一条 `z-50` 立刻 exit 1，清理后 exit 0。
   它比"加一条 oxlint 规则"更合适——oxlint 没有现成的"禁某个数值区间的 class"规则，
   而 `shadcn/no-arbitrary-values` 只拦 `z-[35]`、拦不住 `z-50`（`z-50` 是合法类名）。
   踩到的一个坑：**必须先剥注释**，否则「注释里提到 z-40」会假红。
2. **默认出口**：业务侧需要"盖住别的东西"时，唯一合法做法是用 ui-web 里带 portal + 档位的
   浮层组件（`Dialog` / `Sheet` / `Popover` / `Tooltip` / `DropdownMenu`），不自搓 `absolute` + `z-*`。
   确实需要"就地全屏"这类形态时，用 `z-overlay` 表达意图，别写数值。
3. **内部相对层级要关进层叠上下文**：`data-table/table-shell.tsx` 已加 `isolate` 作为范例。
   判据：**这个 z 只跟"我这一块内部"比大小，还是需要跨块比？** 前者一律 `isolate` 掉。
4. **约束补记（已写进 DESIGN.md §2.4）**：`DialogContent` / `AlertDialogContent` / `SheetContent`
   都带 `-translate-*`（transform ⇒ 制造 containing block），且 `DialogContent` 有 `overflow-y-auto`。
   目前没有踩到"fixed 落在 transform 祖先里被错位"，是因为所有浮层都走了 Portal
   （Base UI 的 Positioner 默认 `position: fixed`，见 `internals/constants.mjs:38` /
   `select/positioner/SelectPositioner.mjs:21`）。**在弹窗内部渲染的非 portal 浮层**
   （手写 `absolute` 下拉）会以弹窗为定位与裁剪容器，被裁掉或错位。
   已核对业务侧目前没有这种写法（`bg-popover` 检索为 0），属于防患。

---

## 6. 附：实测口径（可复现）

```bash
# 业务侧是否还有裸数值层叠（改完后：0）
pnpm z-index:guard

# 五档 token 是否真的进了产物（改完后：各 1 条）
grep -oE '\.z-(sticky|raised|chrome|overlay|toast)\{z-index:var\(--z-index-[a-z]+\)\}' apps/web/dist/client/assets/styles-*.css
grep -oE '\-\-z-index-[a-z]+:[0-9]+' apps/web/dist/client/assets/styles-*.css | sort -u

# Tailwind v4 里 z-* 的官方命名空间就是 --z-index-*（不用 @utility 自造）
grep -o 'functional("z",{supportsNegative:!0,handleBareValue[^}]*themeKeys:\["--z-index"\]' \
  node_modules/.pnpm/tailwindcss@*/node_modules/tailwindcss/dist/lib.js

# 有无统一 token（修复前：无）
grep -rn "z-index\|--z-" packages/ui-web/src/styles.css apps/*/src/styles.css

# Base UI 是否管理 z-index（答案：不管理，只有 SliderThumb）
grep -rln "zIndex" node_modules/.pnpm/@base-ui+react@1.8.0*/node_modules/@base-ui/react

# toast portal 是否门控挂载（答案：无门控 → 首屏 append → 永远最下）
cat node_modules/.pnpm/@base-ui+react@1.8.0*/node_modules/@base-ui/react/toast/portal/ToastPortal.mjs
cat node_modules/.pnpm/@base-ui+react@1.8.0*/node_modules/@base-ui/react/dialog/portal/DialogPortal.mjs
```
