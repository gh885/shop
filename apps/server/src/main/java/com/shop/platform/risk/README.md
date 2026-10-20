# risk — 风控

> 核心域 · schema `risk` · 未开工

```yaml
module: risk
layer: 核心域
schema: risk
status: not-started
depends_on: []
emits: []
consumes: []
```

## 职责

刷单、套现、黄牛、盗号、内容风控。

## 拥有什么

`risk_event` `rule_set` `decision_log`

表都建在 `risk` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**不阻塞主链路。** 判定结果走 api 同步点查，异常单进人工队列。

## 闭环断点

未开工。判定结果没有消费方，这是刻意的：它先攒数据再定规则。

## 层与依赖

层：核心域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
