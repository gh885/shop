# notification — 通知

> 通用域 · schema `notification` · 未开工

```yaml
module: notification
layer: 通用域
schema: notification
status: not-started
depends_on: []
emits: []
consumes: []
```

## 职责

站内信、短信、推送、订阅。

## 拥有什么

`message` `subscription`

表都建在 `notification` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

外采通道，**自建模板与频控**。频控是产品能力，不是渠道能力。

## 闭环断点

未开工。它的消费事件清单还没定，所以这里留空——列「订阅一切」等于没设计。

## 层与依赖

层：通用域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
