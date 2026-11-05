# cms — 内容管理

> 无域（UGC）· schema `cms` · 未开工

```yaml
module: cms
layer: 无域
schema: cms
status: not-started
depends_on: []
emits: []
consumes: []
```

## 职责

页面搭建、店铺装修、活动落地页。

## 拥有什么

`page` `block`

表都建在 `cms` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

自建 schema，渲染可外采。

## 闭环断点

未开工。

## 层与依赖

层：通用域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
