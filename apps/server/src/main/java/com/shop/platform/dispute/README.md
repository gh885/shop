# dispute — 纠纷

> 核心域 · schema `dispute` · 未开工

```yaml
module: dispute
layer: 核心域
schema: dispute
status: not-started
depends_on: ["returns :: api"]
emits: ["DisputeResolved"]
consumes: []
```

## 职责

平台介入、仲裁、举证、大众评审。

## 拥有什么

`dispute_case` `evidence` `ruling`

表都建在 `dispute` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

裁决结果是事实，钱怎么动由 clearing 执行。

## 闭环断点

未开工。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
