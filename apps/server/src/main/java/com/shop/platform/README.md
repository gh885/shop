# 模块地图（代码侧）

这份是 [module-map.md](../../../../../../../../docs/domain/module-map.md) 在代码里的落地版：只讲**包里该有什么**，为什么这么分去看那份。

## 一条判据

**模块 = 顶层包 = PG schema，三者一对一。**

框架按应用的直接子包识别模块。写成 `core/trade`，被识别的模块就是 `core`，`trade` 降级成普通子包：
`allowedDependencies` 失守、schema 塌成 `core`、整张地图作废。

所以层是标签，不是目录。

## 五个顶层包

| 包         | 是什么           | 有 schema        | 说明                                  |
| ---------- | ---------------- | ---------------- | ------------------------------------- |
| `common`   | 共享包，纯契约   | 是（`common`）   | 发号、事件接口、错误码词表            |
| `infra`    | 共享包，基础设施 | 否               | web / security / event，见它的 README |
| `audit`    | 模块             | 是（`audit`）    | 平台能力里唯一有自己表的              |
| `seller`   | 模块             | 是（`seller`）   | 支撑域                                |
| `clearing` | 模块             | 是（`clearing`） | 核心域                                |

`common` 和 `infra` 在 `ShopServerApplication` 的 `@Modulithic(sharedModules = …)` 里声明为共享包，
不参与 `allowedDependencies` 登记——否则三十多个模块每个都要重复一遍。

## 依赖方向

```
模块 → 模块的 api/ 或 events/     唯一允许的跨模块通道
模块 → common / infra            允许，共享包没有方向限制
infra → 模块的 api/              允许，用来注册 SPI（例：infra.security 定义 OperatorResolver，seller.api 实现）
common → 任何模块                禁止
```

**`common` 不许依赖任何模块**，也不许引入需要连库的东西——它被所有模块依赖，一个 Spring Data 依赖进来就是全网扩散。

## 加一个模块的五个步骤

1. 建顶层包，例如 `catalog/`
2. 写 `package-info.java`：`@ApplicationModule(displayName = "Catalog [core]", allowedDependencies = {"governance :: api"})`
3. 加一条迁移 `V<时间戳>__catalog_<动作>.sql`，里面 `CREATE SCHEMA catalog`
4. 按需建子包，**不预建空目录**——薄模块只有 `service/ mapper/` 是正常的
5. 跨模块的地方只开 `api/`（`@NamedInterface("api")` + `XxxReadQuery`/`XxxCommand`）和 `events/`

## 子包

```
<module>/
├── package-info.java     模块声明 + 允许依赖
├── controller/           REST 入口，一个 handler 只调一个 service 方法
├── dto/                  XxxRequest / XxxQuery
├── service/              编排 + 出参形状
├── model/                聚合、值对象、状态机
├── mapper/               Entity + Mapper + 手写 SQL（唯一允许出现 SQL 的模块内包）
├── api/                  对外同步入口
├── events/               出站事件
└── internal/             渠道 SDK、文件解析、读模型（外部不许 import）
```

`ArchitectureTest` 会检查这条：住在这八个之外就是红灯。加子包等于改蓝图，先改文档。

## 不要把什么放进来

- 跨模块的公共工具 → `common`
- 需要连库的东西 → `infra` 或模块的 `mapper`
- 「暂时先放这儿」的类 → 半年后没人敢删
