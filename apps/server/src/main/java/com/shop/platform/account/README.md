# account — 买家账号

> 通用域 · schema `account` · 未开工

```yaml
module: account
layer: 通用域
schema: account
status: not-started
depends_on: []
emits: []
consumes: []
```

## 职责

买家账号、登录方式、安全设置。

## 拥有什么

`buyer` `login_binding`

表都建在 `account` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

账号主体自建，登录方式外采。与卖家的 `operator`、平台的 `staff` 是三套独立身份，不共用表。

## 闭环断点

未开工。现在只有卖家账号能登录。

## 层与依赖

层：通用域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
