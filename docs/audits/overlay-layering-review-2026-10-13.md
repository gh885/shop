# 浮层层级审查：z-index 与渲染顺序

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

### 修复方向

**A. 止血（1 行，可立即上）** —— 给 toast 一个高于浮层的专属档：

```diff
// packages/ui-web/src/components/ui/toast.tsx
- "pointer-events-none fixed inset-x-4 top-4 z-50 mx-auto w-auto max-w-sm outline-none",
+ "pointer-events-none fixed inset-x-4 top-4 z-60 mx-auto w-auto max-w-sm outline-none",
```

配套在 `packages/ui-web/src/styles.css` 用现成的 `@utility` 落一个语义档（该目录
`shadcn/no-arbitrary-values` 已关闭，写 `z-[60]` 也合法，但语义档更好读）：

```css
@utility z-toast {
    z-index: 60;
}
```

**B. 根治（推荐）—— 让层级由"层"决定，而不是由"挂载顺序"决定**

Base UI 的 `Portal` 支持 `container`。在根布局挂一组固定的分层宿主 div，各层自带 z-index，
各浮层组件按层取容器：

```tsx
// packages/ui-web/src/components/overlay-layers.tsx（示意）
const LAYERS = { popover: 50, dialog: 55, toast: 60 } as const
// 根布局渲染 <div id="shop-layer-popover" class="z-50"> / -dialog / -toast（各一个，常驻）
// Popover/Select/Combobox/Tooltip/DropdownMenu 的 Portal 传 container={popoverLayerRef}
// Dialog/AlertDialog/Sheet 传 container={dialogLayerRef}；Toaster 传 container={toastLayerRef}
```

这样 toast 不再依赖"谁先挂载"，任何层内新增浮层也自动落在本层内、按挂载顺序排，
跨层关系由数值唯一确定。**嵌套仍走 Base UI 的 `parentPortalNode` 优先**，语义不变。

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

### 修复方向

- (a) 全屏 SKU 编辑器改用真 `Dialog`（`DialogContent` 已有 `max-h-[calc(100dvh-2rem)]` +
  `overflow-y-auto` 的收口，见 `dialog.tsx:71-74` 的注释），或至少走 portal + 明确档位，
  并在 DESIGN.md 登记例外。
- (b) 让这个竖展容器也走 portal（与 mega 面板同一条路），或把 `<section>` 显式 `isolate`
  并把它降到 `z-30`。**不要继续依赖"祖先恰好没设 z-index"。**
- (c) 降回 `z-40`（它是装饰，没必要占浮层档）。

---

## 5. 防回归建议

1. **门禁**：加一条 oxlint 自定义规则（或复用 `eslint-plugin-boundaries` 式约束），
   禁止 `apps/*/src/**` 出现 `z-{数字}` / `z-[…]`。DESIGN.md 已有文字规则但零门禁，
   这也是为什么 3 处手写能活到今天。
2. **默认出口**：业务侧需要"盖住别的东西"时，唯一合法做法是用 ui-web 里带 portal + 档位的
   浮层组件（`Dialog` / `Sheet` / `Popover` / `Tooltip` / `DropdownMenu`），不自搓 `absolute` + `z-*`。
3. **约束补记**：`DialogContent` / `AlertDialogContent` / `SheetContent` 都带 `-translate-*`
   （transform ⇒ 制造 containing block），且 `DialogContent` 有 `overflow-y-auto`。
   目前没有踩到"fixed 落在 transform 祖先里被错位"，是因为所有浮层都走了 Portal
   （Base UI 的 Positioner 默认 `position: fixed`，见 `internals/constants.mjs:38` /
   `select/positioner/SelectPositioner.mjs:21`）。**这条要写进 DESIGN.md**：
   在弹窗内部渲染的非 portal 浮层（手写 `absolute` 下拉）会以弹窗为定位与裁剪容器，
   已被裁掉或错位。已核对业务侧目前没有这种写法（`bg-popover` 检索为 0），属于防患。

---

## 6. 附：实测口径（可复现）

```bash
# 浮层 z 值分布（24 处，全是 z-50）
grep -rn "z-50" --include=*.tsx --include=*.ts packages/ui-web/src apps/*/src | grep -v "\.test\."

# 有无统一 token（答案：无）
grep -rn "z-index\|--z-" packages/ui-web/src/styles.css apps/*/src/styles.css

# Base UI 是否管理 z-index（答案：不管理，只有 SliderThumb）
grep -rln "zIndex" node_modules/.pnpm/@base-ui+react@1.8.0*/node_modules/@base-ui/react

# toast portal 是否门控挂载（答案：无门控 → 首屏 append → 永远最下）
cat node_modules/.pnpm/@base-ui+react@1.8.0*/node_modules/@base-ui/react/toast/portal/ToastPortal.mjs
cat node_modules/.pnpm/@base-ui+react@1.8.0*/node_modules/@base-ui/react/dialog/portal/DialogPortal.mjs
```
