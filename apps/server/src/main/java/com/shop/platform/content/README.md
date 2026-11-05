# content — 内容

> 无域（UGC）· schema `content` · 未开工

```yaml
module: content
layer: 无域
schema: content
status: not-started
depends_on: []
emits: []
consumes: []
```

## 职责

图文、短视频、直播、种草。

## 拥有什么

`article` `stream`

表都建在 `content` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

内容是流量入口，**不承载交易事实**。

## 闭环断点

未开工。

## 层与依赖

层：支撑域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
