# reui — 第三方 vendored 组件

来源：[reui.io](https://reui.io)，经 `components.json` 的 `@reui` registry 取得
（`https://reui.io/r/{style}/{name}.json`），registry 声明见 `packages/ui-web/components.json`。

装进来是为了替换两处手写实现；现已全部接入：

| 原手写实现 | 消费点 | 接入后的组件 | reui 模式 |
| --- | --- | --- | --- |
| `region-picker.tsx`（单选，240 行 tab 逐层） | web 收货地址、seller 商家地址（经 app-kit `RegionField`） | 本目录 cascader | `columns` + `searchScope="deep"` |
| `apps/seller/.../RegionMultiPicker.tsx`（多选，306 行手搓） | seller 运费模板地区规则 | 本目录 cascader | `tree` + `multiple` + `cascade` |

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

## 接入方式

不要在 app 里直接 import 本目录。业务一律经 `@shop/ui-web` 的出口取件
（`../reui-cascader.ts` 只导出拼装级联选择器用得到的积木）；数据走 `@shop/common` 的 `regions`。
调用方只用两个业务组件：地址用 app-kit 的 `RegionField`，运费模板用 seller 的 `RegionMultiPicker`。
