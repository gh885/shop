# reui — 第三方 vendored 组件

来源：[reui.io](https://reui.io)，经 `components.json` 的 `@reui` registry 取得
（`https://reui.io/r/{style}/{name}.json`），registry 声明见 `packages/ui-web/components.json`。

装进来是为了替换两处手写实现，另外两个是新增能力（现已全部接入）：

| 原手写实现                                                  | 消费点                                                    | 接入后的组件    | reui 模式                        |
| ----------------------------------------------------------- | --------------------------------------------------------- | --------------- | -------------------------------- |
| `region-picker.tsx`（单选，240 行 tab 逐层）                | web 收货地址、seller 商家地址（经 app-kit `RegionField`） | 本目录 cascader | `columns` + `searchScope="deep"` |
| `apps/seller/.../RegionMultiPicker.tsx`（多选，306 行手搓） | seller 运费模板地区规则                                   | 本目录 cascader | `tree` + `multiple` + `cascade`  |
| —（原先没有层级列表组件）                                   | admin 类目运维页                                          | 本目录 tree     | 见下方「tree」                   |

数据归一（直筒子市合成 6 位叶子、9 位街道码不进树）在 `@shop/common` 的 `regions.ts`
（`loadRegionCascaderTree`），不在本目录；本目录只负责渲染。

## 改动原则

**业务封装放上层，vendored 文件尽量不动。** 三类改动分开看：

1. **业务语义**（选哪个模式、搜索怎么配、`regionCode` 怎么合成）→ 全部写在适配层，永不动本目录。
2. **上层缺契约**（如 reui Badge 引用 `bg-focus`，本项目 theme 原本没声明这个 token）→
   补 `styles.css` 的 token，不改 `badge.tsx`。
3. **只为通过本仓库编译门**（`strict` + `noUncheckedIndexedAccess`）的机械改动 → 允许，但**逐条记在下面**。

## 本地已改动清单（与上游的差异）

对上游做了下列改动，**全部是编译/类型层面的机械修复，零行为变化**；重新安装/升级前先对照这里：

- `cascader.tsx`、`cascader-lib.tsx`、`cascader-columns.tsx`：
    - `process.env.NODE_ENV` → `import.meta.env.DEV`（本项目用 Vite，`apps/*` 与 `packages/common`
      也一律用 `import.meta.env.DEV`；浏览器侧没有 `process`）。共 11 处。
    - `noUncheckedIndexedAccess` 引起的取值判空（`stops[i]` / `nodes[i]` / `path[path.length-1]`
      等改成先取值再判空或 `.at()`），不改任何控制流。
- `cascader-nav.tsx`：`segments` 在 `display="leaf"` 分支的 `leaf` 判空（类型收窄用，非新增分支）。

配置侧（不在本目录，但同属「让 vendored 落地」的改动）：

- `packages/ui-web/package.json`：`@tanstack/react-virtual`（虚拟列表）、`vite`（devDep，供
  `import.meta.env` 类型）。
- `packages/ui-web/tsconfig.json` / `packages/app-kit/tsconfig.json`：`types: ["vite/client"]`
  （app-kit 经 paths 直接编译 ui-web 源码，也需要这个类型）。
- `packages/ui-web/src/styles.css`：新增 `focus` / `focus-foreground` token（reui Badge 的 focus 系变体）。
- `packages/config/oxlint.config.ts`：`reui/**` 豁免面向第一方 UI 的 a11y / 样式规则
  （逐条理由见该文件注释）；正确性仍由 tsc 全程把关。
- `.fallowrc.json`：`reui/**` 豁免死代码判定（vendored 代码按第三方处理）。

## data-grid（第三方数据表格）

同一来源（reui.io registry）的第二个组件，12 个文件 ~10k 行，基于 **TanStack Table v9**
（与项目现有 `dataTableFeatures` 同一代底座；reui 的 `dataGridFeatures` 是它的超集，多了
ordering/pinning/sizing/resizing/expanding/cellSelection）。用于替掉/升级
`packages/ui-web/src/components/data-table/`（528 行）。

**关键性质（决定了怎么接）**：

- `DataGrid` 只吃 `{ table, tableLayout, children }` —— 吃你给的 table 实例，**不接管取数**，
  分页仍由 TanStack Query 管（项目规约）。
- `tableLayout` 里 `columnsResizable / columnsDraggable / cellSelection / rowsPinnable` 等
  **默认全 false**，能力按需开启；引入它不会平白多出电子表格行为。
- `data-grid-cell-selection.tsx`（2600 行，电子表格级）只被自己引用，是**可选叶子模块**，
  本项目不开 `cellSelection`，故不接（保留在目录里，bundler 会 tree-shake）。

**本地改动清单**（与上游的差异，零行为变化）：

- `data-grid-cell-selection.tsx`：一个 `arr[i]` 在 `noUncheckedIndexedAccess` 下的判空
  （`let` 自增变量类型收窄跨不过去，改成先取值再判断）。
- `data-grid-table.tsx` / `-virtual` / `-dnd` / `-dnd-rows`：删掉未用的类型/值 import；
  `DataGridTableBodyRowSkeleton` 不再解构未用的 `table`；`DataGridTableHeadRow` 保留
  `rowId` 形参类型但不取用。
- `data-grid-table.tsx`：`DataGridTable` / `DataGridTableHeader` 的公开泛型 `TData` 内部不引用，
  加了 no-op 类型引用避免 TS6196（公开签名的一部分，调用点靠它标注）。

## tree（第三方层级列表）

同一来源（reui.io registry）的第三个组件：`tree.tsx`（216 行，`Tree` / `TreeItem` /
`TreeItemLabel` / `TreeDragLine`），底层是 **`@headless-tree/core` + `@headless-tree/react`
1.7**（本项目新装的依赖，见 `package.json`）。它是纯展示层：展开/选中/拖拽/改名/搜索全在
headless-tree 的 feature 里，靠调用点注册（`syncDataLoader` / `asyncDataLoader` /
`selection` / `dragAndDrop` / `keyboardDragAndDrop` / `renaming` / `search` / `expandAll`）。

**接线现状**：admin 的类目运维页（`apps/admin/src/category/`）是当前唯一消费点，注册
`syncDataLoaderFeature`（整棵树一次拉全，见 `/admin/categories/tree`）、`selectionFeature`、
`hotkeysCoreFeature` 与 `dragAndDropFeature`。积木经 `../index.ts` 公开（与 cascader 同理）。
headless-tree 的引擎（`@headless-tree/core` / `react`）因此也是 admin 的依赖：树是无头组件，
`useTree` 必须由组装方创建，这一步藏不进 ui-web。

排序有两个入口（选中行的同级上下移、树上拖拽），落库都折成同一份 sort 更新；jsdom 里发不出
原生拖拽，所以回归只覆盖上下移那条路，拖拽靠 `canDrop` 把范围钉死在同级。

**实测到的两个 headless-tree 语义**（踩过才知道，别再猜）：

- **`rootItemId` 指向的那个节点自己不渲染**（`getItems()` 里没有它，`getItemMeta().level` 为
  `-1`），顶层类目是它的 children（level 0）。所以必须把合成根放进 `expandedItems`
  （受控表就写 `state.expandedItems`），否则树是空的——而它的 children 要等挂载后的状态生效
  才出现在 `getItems()` 里（首帧为空）。
- **点一下就是「展开 + 选中」两件事**（folder 的 primaryAction 展开，selectionFeature 顺带选中），
  不需要自己接 onClick 去 toggle；键盘走 `hotkeysCoreFeature`。
- **挂 React Compiler 时必须在读 `getItems()` 的组件上加 `"use no memo"`**：`getItems()` 是
  builder 调用，状态挂在身份不变的 tree 实例上，编译器会把整行 JSX 连同读取一起缓存住
  （实测表现：整棵树空白）。与 cascader-virtual / data-grid 里那两处 bail 同类。

**本地改动清单**（与上游的差异，零行为变化）：

- 无。`tree.tsx` 原样保留（上游 2 空格缩进也没动）。

两条与编译/样式相关的既有事实：

- `tree.tsx` **没有走本项目的 oxfmt 格式**（上游 2 空格缩进），刻意保持原样：跑 `pnpm format:web`
  会把它与 `badge.tsx` / `icon-tile.tsx` / `cascader.tsx` 一起重排，那类漂移要单独一个 commit，
  别混进业务改动。
- `tree.tsx` 的 `import { cn } from "cn"` 不是笔误：`cn@^0.2.6` 是 ui-web 的既有依赖，
  本目录 18 个 vendored 文件都这么引；项目自己的文件才用 `src/lib/utils`。

## phone-input（已评估，未采用）

reui 的 `phone-input`（229 行）装在 `reui/phone-input.ts`，但**没有接进登录表单**——它是给
「国际 E.164 + 国家下拉」设计的：自带 outline 皮肤的国旗触发器，而本项目手机号只收
**裸 11 位**（`/^1[3-9]\d{9}$/`，后端 @Pattern 写进 OpenAPI），登录表单是 filled 皮肤 +
固定 `+86` 前缀。两处形态都不合，接上去反而要把 E.164 剥成裸号、多一层无用交互。

真正有价值的是它背后的号码元数据，已被 `packages/ui-web/src/components/phone-field.tsx`
以「只用 `react-phone-number-input/min`（无 UI 依赖）做实时有效性」的方式吸收：表单仍是
InputGroup filled + 静态 +86，值仍是裸 11 位，号码规则变化不必改正则。

一个实测发现：号码库的 CN 校验**比项目契约宽**——`1x` 开头基本都放行，不强制 `1[3-9]`。
所以「1[3-9]」这条硬规则仍由 `PhoneSchema` 把关，`PhoneField` 的实时校验只补位数/号段
元数据这一层。文件保留在 `reui/phone-input.ts`（未接线的 vendored 代码），升级/重装时
一并覆盖。

- `packages/common/src/shared-vocabulary.test.ts`：EXCLUDED 排除 `components/{reui,examples}/` ——
  第三方组件的内部行为（如表格自己的剪贴板）不归「同一概念只许一个出口」约束。

**已接线**（方案 A：换渲染器 + 反转组合）。四个设计决定：

1. **列 meta 双轨**：列定义写的是项目形状 `{variant, className}`（列语义 strong/muted +
   表头与单元格共用的 class），reui 读的是 `{headerClassName, cellClassName}`。两者是
   feature slot 里不同的类型（`declare module` 增强也到不了 `metaHelper`），所以
   `data-table-features.ts` 铺开 reui 的 feature 注册、只覆写 `columnMeta` 为项目形状
   —— 14 处列定义与 51 个调用点零改动。
2. **归一在建表前**（`useDataTable` → `withReuiColumnMeta`），不是建表后改表实例：reui 的
   `DataGridTable` 读列走 `getStart/Center/RightVisibleLeafColumns()`，建表后再改列访问器
   改不动。
3. **取数不接管**：分页/排序/筛选仍由 TanStack Query 管（列上开 `manual*`）。空态用
   `emptyMessage` 传项目文案（`Empty` 组件包一层）。`DataGrid` 的 `recordCount` 必须传
   **总数**（`table.getRowCount()`）：分页条的 from/to/共 N 条全取自它。
4. **组合顺序反过来**：`DataTable` 是 provider（不渲染 DOM），工具栏与表卡是它的 children。
   reui 的 `DataGridPagination` 与 `DataGridColumnVisibility` 走 `useDataGrid()`，只有落在
   provider 内才渲染得出来——这正是手写的这两个组件能删掉的前提。分页条接在 `TableShell`
   的 `footer` 槽里（`DataTableCard`），中文标签在 `DataTable` 的 `i18n` 覆写一次。
   **不引** `column-filter` / `scroll-area` / `dnd` / `virtual` / `cellSelection`。

回归由 `data-table.test.tsx` 钉住：行渲染（表实例未被浅拷贝成死快照）、`variant`/`className`
落到表头与单元格、空态文案、分页条计数取总数。

**与 reui 的口径差异**（接手前知道）：

- `DataGridPagination` 只有上一页/下一页两个箭头（上游注释写明没有末页箭头），原来手写的
  那条有首/末页；页码超出窗口时靠可点击的省略号跳转。
- 列显隐的入选口径是 `getCanHide()`，不再额外要求列挂 `accessorKey`：CMS 那些
  `id` + 读 `row.original` 的展示列现在也能隐藏（操作列 `enableHiding: false`，仍不出现）。
- 每页条数沿用项目的 `[10, 20, 30, 40, 50]`（`DataTableCard` 显式传 `sizes`）。

## 接入方式

不要在 app 里直接 import 本目录。业务一律经 `@shop/ui-web` 的出口取件——reui 的入口只被
包内的组装层直接引（cascader 见 `../region-picker.tsx`，data-grid 见 `../data-table/`），
包外要拿的积木写进 `../index.ts`：目前只有 cascader 那一组（seller 的 `RegionMultiPicker`
在包外自己组装 tree + multiple），data-grid 不占公开面，外面只见 `DataTable` 系列。
数据走 `@shop/common` 的 `regions`。
调用方只用两个业务组件：地址用 app-kit 的 `RegionField`，运费模板用 seller 的 `RegionMultiPicker`。
