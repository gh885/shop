# im — 即时通讯

> 通用域 · schema `im` · 未开工

```yaml
module: im
layer: 通用域
schema: im
status: not-started
depends_on: []
emits: []
consumes: []
```

## 职责

买卖家会话、消息、敏感词。

## 拥有什么

`conversation` `message`

表都建在 `im` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

优先外采，**会话留痕自建**（纠纷举证要靠它）。

## 闭环断点

未开工。

## 层与依赖

层：通用域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
