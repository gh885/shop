# 前后端字段约束

## 一份定义，生成前端数据

Java 的具名规则与校验注解是权威。springdoc 导出 OpenAPI，现有 `@hey-api/openapi-ts` 的 `@hey-api/schemas` 插件（`type: "form"`）生成普通常量对象；前端从 `@shop/api/schemas` 读取。没有新增运行时接口，也不另写生成器。

```text
Java 规则 / DTO 注解 → openapi/api-docs.json → packages/api/src/sdk/schemas.gen.ts
                                             ↓
                            common / app-kit / app 本地的语义出口
```

```ts
import { CreateProductRequestSchema } from "@shop/api/schemas"

export const PRODUCT_NAME_MAX = CreateProductRequestSchema.properties.name.maxLength
```

`schemas.gen.ts` 是生成物，不手改。包的 `./schemas` 子路径直接导出数据，不从 SDK 客户端或 Zod 内部结构反查约束。现有常量名与使用方保持不变，只把右值从数字换成契约引用。

## 新规则怎么放

- **契约已表达的约束**：直接读取 `maxLength/minLength`、`maxItems/minItems`、`minimum/maximum` 等。数组元素长度取 `properties.<字段>.items.maxLength`。字段或约束被删除时应由类型检查报错，禁止 `?? 30` 一类旧值兜底。
- **前端更严格的限制**：保留具名本地值，登记到 `FieldRuleVocabularyTest.FRONTEND_LIMITS`，说明理由并检查不超过契约。例如详情页数量选择上限与后端单行数量上限是两个概念。
- **尚未结构化的规则**：联系电话长度、卖点的可空区间、类目层级仍保留少量 `JAVA_TWINS` 检查。不要为取几个数字扫描任意 Java 源码或实现通用正则解析器。后续先改进契约表达，再迁移对应数字。
- **纯前端策略**：分页自动加载次数、折叠条数等继续留在原模块；符合数值普查命名规则的手写整数登记 `POLICY_NUMBERS`，不为了共享而塞进后端。

同值不代表同义。收件人长度和昵称长度即使相等，也必须引用各自字段的契约。跨入口确属同一规则时继续复用 `common` / `app-kit` 的已有出口；只有一个 app 使用的常量不必搬包。

已知券状态也直接复用生成契约：`USER_COUPON_STATUSES` 引用 `AdminCouponItemSchema.properties.status.enum`，其 Java owner 是 `UserCouponStatus`。不再手抄数组或让 Java 测试解析 TS 源码；枚举声明序经现有 OpenAPI / schema 漂移门禁保持。买家 `MyCouponResponse.status` 仍是自由字符串，未知状态继续由展示层兜底，不收紧响应校验。

## 表单行为不交给生成器

只生成约束数据，不用请求 Zod schema 直接替换整张表单。草稿与发布的必填差异、`trim`、空串处理、跨字段条件、国际化提示仍由现有表单规则负责。长度提示继续通过 `withMaxLength` / `withMinLength` 把同一个上限传入校验与文案参数。

**后端必须继续校验。** 生成只保证开发期同步，已经打开的旧页面不一定使用最新规则。

## 验证与生成

```bash
pnpm sdk:gen                                  # 后端运行时：重新导出契约并生成全部 SDK 文件
pnpm --filter @shop/api exec openapi-ts        # 仅从已提交的契约重新生成
pnpm exec vp check
pnpm typecheck
pnpm test:project @shop/common schema-constraints.test.ts
```

- `schema-constraints.test.ts` 遍历整份契约，检查生成物保留数值、正则、枚举、必填和引用约束，包含数组元素与零边界；没有手工字段对应表。
- `pnpm sdk:drift`（= `scripts/check-sdk-drift.mjs`）在 pre-push 和 CI 比较全部生成物，包含 `schemas.gen.ts`。
- `FieldRuleVocabularyTest` 继续检查 Java 常量、注解、契约与数据库列宽；前端仅登记必须手写的例外。生产数值普查排除测试夹具与生成物；把生成引用改回手写整数会被判为未登记。
- 新增 schema 引用后运行相关表单测试与三端构建；未引用的 schema 可以被打包器移除，但引用字段可能保留其所属 schema 对象，不能宣称零体积。

回滚时一起还原插件配置、包导出、消费方和门禁；不要只删除生成文件或关闭漂移检查。
