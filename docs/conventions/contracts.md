# 跨端契约的单一真相源

> 一句话：**一个概念只许有一个出处，其余各处要么由它生成、要么由门禁把它核回来。** 这份文档立的是「怎么
> 加一份新契约」的模板与判据；具体每条契约的词表/规则在各自的文档里（见下表「细则」列）。
>
> 治的病：同一个值被抄在 Java、TS、nginx、yml 好几遍，改一边忘一边——而且大多是**无声**的（编译照过、
> 测试照绿，只有联调或线上才浮出来）。错误码拼错断一条前端分支，判权码拼错断一次越权，路由前缀抄错部署后
> 404。把它们收成一份真相源，代价从「记得同步改四处」变成「跑一条命令」。

## 判据：生成式，还是校验式

一份契约落哪条路，只问一个问题——**这些消费点能不能由一个工具产出？**

| 情况                                                                                                              | 走法                                         | 门禁                                                          |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| 值/常量单一来源，能被脚本原样吐成 Java + TS（两边只是同一份数据换了个宿主语言）                                   | **生成式**：真相源 → `--write` 产出生成物    | `xxx:drift`（`--check` 把生成物核回真相源）+ 消费侧一致性测试 |
| 三处运行时形态本就不同，没法「生成」（nginx 反代 / Vite dev 代理 / 后端 CORS 是三种配置，不是一份数据的三次渲染） | **校验式**：钉一份口径文件，脚本交叉比对各处 | `xxx:drift` 直接读各处、比对、不一致即红                      |

现在各自站在哪边：

- **生成式**：[error-codes](../error-codes.md)、[permission-codes](./permission-codes.md)、[i18n](./i18n.md)。
  真相源改一次 → `pnpm errors:gen` / `permissions:gen` / `i18n:gen` 重生两份 owner。
- **校验式**：`contracts/routing.yaml`（nginx + 三端 vite proxy + `application.yml` CORS）；SDK
  （`openapi/api-docs.json` 生成物 ⇄ `packages/api/src/sdk` ⇄ 运行中后端，见 `pnpm sdk:drift`）；
  契约形状（业务代码手打的匿名对象逐字等于契约类型，`pnpm types:drift`）。

**真相源一律 `.yaml`**（2026-10 把 `error-codes` / `permissions` 从 `.mjs` 统一过来）：`contracts/` 里全是**纯数据**
（码卡数组、配置映射），没有计算逻辑，YAML 完全表达。`.mjs` 反而带来两类真实摩擦——它被 codegen 以运行时算出的
路径动态 `import`，fallow 静态图看不见那条边，得单独挂 `entry` 豁免；而它是 JS，Java 侧要读只能正则刮文本。

- 前端 node 脚本用 `yaml` 包解析它（`i18n-config.mjs` / `routing-drift.mjs` / 两份 codegen 都这么读）。
- 后端**运行期**要读同一份配置时也用 YAML：`i18n.config.yaml` 被 `scripts/i18n-codegen.mjs` 和后端
  [`SupportedLocales.java`](../../apps/server/src/main/java/com/shop/platform/infra/web/SupportedLocales.java)
  各读一次。
- 后端**纯文本门禁**刮某份真相源时（如 `ErrorCodeVocabularyTest` 逐张码卡核 `status`/`behavior`），它按 YAML
  块序列的 `^\s*key: value` 正则刮——改那份文件的**形状**会连带要改解析器。这是「被第二种语言读」的真实代价，
  但 YAML 比让 Java 去 eval JS 中立得多，代价可控且已被这条门禁的单测兜住。

> 只有当某份真相源真的需要「数据之外」的东西（派生、条件、函数）才另议可执行格式——目前没有，别为不存在的需求
> 留 `.mjs`。

## 三件套：一份契约的完整构成

新建一份契约，这三块缺一不可，命名与接线照抄现成的：

1. **真相源**：放 `contracts/`，`.yaml` 存数据（码卡数组 / 配置映射）。文件头注释写明「改这里、别改
   生成物」，并列出字段含义。
2. **生成 / 核对脚本**：放 `scripts/`，命名 `<domain>-codegen.mjs`（生成式）或 `<domain>-drift.mjs`
   （校验式）。
    - 生成式必须支持四档：`--write`（落盘）/ `--check`（门禁，pre-push + CI 跑这条）/ `--audit`（迁移工作单）
      / `--preview`（写临时目录，看产物长什么样，仓库里不留生成物）。
    - package.json 出两条 script：`xxx:gen`（= `--write`）、`xxx:drift`（= `--check` 或直接跑比对脚本）。
    - 接线两处、同一道门：`lefthook.yml` 的 `pre-push`（`tags: [contract]`，`timeout: 60s`）与
      `.github/workflows/ci.yml`。**drift 一律进 pre-push + CI，不进 pre-commit**——它是全仓检查，压在每次
      commit 上只会逼人用 `LEFTHOOK_EXCLUDE` 绕开。
3. **消费侧一致性核对**：光有「生成物 ⇄ 真相源」不够，还要核「真相源 ⇄ 真实使用它的地方」。能跨
   Java/TS 边界的核对放 **JUnit**（`@Tag("contract")`，`mvn -Dgroups=contract`，无库不起 Spring）——如
   [`PermissionVocabularyTest`](../../apps/server/src/test/java/com/shop/platform/contract/PermissionVocabularyTest.java)、
   [`ErrorCodeVocabularyTest`](../../apps/server/src/test/java/com/shop/platform/contract/ErrorCodeVocabularyTest.java)；
   纯前端的核对放 node 测试（`routing-drift.test.mjs`、`contract-shape-drift.test.mjs`）。

> **可达性决定测试住在哪种语言里**：断言只要同时读到 Java 常量和 TS 常量 / 两份 `error.json` / 注解扫描，
> 就住 JUnit（它本来就要编译后端）；只读前端源码与生成物的，住 node，别为它起一套 JVM。

## 加 / 改一个契约码，走哪几步

1. 改 `contracts/<domain>` 那一份真相源（加一条 / 改一句说明），**不动**生成物。
2. 跑 `pnpm xxx:gen`，再 `pnpm format`（spotless 会把 Java javadoc 重排，正常）。
3. 跑 `pnpm xxx:drift` 确认绿。
4. 补它的一致性真相：错误码要在两份 `error.json` 各加一句、并让抛码站点用工厂推出对应 status；权限码若要
   挂端点就加 `@RequirePermission(Permissions.X)`、若要授予岗位就改 `StaffRole`/`SellerGrants`。
5. `pnpm test:contract`（后端词表门禁组）+ `vp check`（前端）过。

## 三条踩过的规矩（照 `error-codes-codegen.mjs` 的教训抄来的）

- **先收齐、全校验，再一次性落盘**：半截生成物比没有生成物更糟；一条不合法就一个字节都不写。
- **`--check` 按语义比，不按字节比**：spotless/Google Java Format 会重排 javadoc 换行，逐字节比必然天天
  假红。从生成物里抽出「常量名 + 文档注释」，与真相源渲染的期望值做空白归一后的相等判断。格式归 spotless
  管，内容归这里管。
- **覆盖不全时 `--write` 拒绝落盘**：真相源少了目标里已有的码还要写 = 静默删掉别人的常量。先 `--audit`
  拿迁移工作单。生成物不许是「手改后再没人重生成」的孤儿。

## 现有契约一览

| 契约          | 真相源                                                           | 范式                 | 生成/核对脚本                                                        | 门禁命令                                | 一致性核对                             | 细则                                         |
| ------------- | ---------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------- | --------------------------------------- | -------------------------------------- | -------------------------------------------- |
| 错误码        | [`contracts/error-codes.yaml`](../../contracts/error-codes.yaml) | 生成式               | [`error-codes-codegen.mjs`](../../scripts/error-codes-codegen.mjs)   | `errors:gen` / `errors:drift`           | `ErrorCodeVocabularyTest`              | [error-codes.md](../error-codes.md)          |
| 权限码        | [`contracts/permissions.yaml`](../../contracts/permissions.yaml) | 生成式               | [`permissions-codegen.mjs`](../../scripts/permissions-codegen.mjs)   | `permissions:gen` / `permissions:drift` | `PermissionVocabularyTest`             | [permission-codes.md](./permission-codes.md) |
| locale / 时区 | [`contracts/i18n.config.yaml`](../../contracts/i18n.config.yaml) | 生成式（跨语言共读） | [`i18n-codegen.mjs`](../../scripts/i18n-codegen.mjs)                 | `i18n:gen` / `i18n:drift`               | `LocaleVocabularyTest`                 | [i18n.md](./i18n.md)                         |
| 路由 / CORS   | [`contracts/routing.yaml`](../../contracts/routing.yaml)         | 校验式               | [`routing-drift.mjs`](../../scripts/routing-drift.mjs)               | `routing:drift`                         | `routing-drift.test.mjs`               | [tooling.md](./tooling.md)                   |
| SDK 传输层    | `openapi/api-docs.json`                                          | 校验式               | [`check-sdk-drift.mjs`](../../scripts/check-sdk-drift.mjs)           | `sdk:drift` / `sdk:gen`                 | `contract-audit.mjs`（可空 roundtrip） | [tooling.md](./tooling.md)                   |
| 契约形状      | `openapi/api-docs.json`                                          | 校验式               | [`contract-shape-drift.mjs`](../../scripts/contract-shape-drift.mjs) | `types:drift`                           | `contract-shape-drift.test.mjs`        | [tooling.md](./tooling.md)                   |
