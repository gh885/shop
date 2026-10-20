# search — 搜索

> 核心域 · schema `search` · 未开工

```yaml
module: search
layer: 核心域
schema: search
status: not-started
depends_on: ["catalog :: api"]
emits: []
consumes: ["OfferPublished", "OfferOffline"]
```

## 职责

索引构建、召回、排序、类目导航。

## 拥有什么

`index_doc` `query_log`

表都建在 `search` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**只持有投影，不持有交易数据。** 它挂了要能降级到类目浏览。

## 闭环断点

未开工。ES 刻意推迟：先用 PG 的 trgm 全文就够。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
