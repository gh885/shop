# media — 素材

> 无域（技术适配）· schema `media` · 未开工

```yaml
module: media
layer: 无域
schema: media
status: not-started
depends_on: []
emits: []
consumes: []
```

## 职责

图片 / 视频上传、转码、CDN。

## 拥有什么

`asset`

表都建在 `media` schema 里，跨 schema 不 JOIN、不建外键。

## 边界

**全部外采。** 本地开发用 MinIO 顶替，接口按 S3 写，换 OSS 只改 endpoint。

## 闭环断点

未开工。MinIO 已在 compose 里（`oss` profile）。

## 层与依赖

层：通用域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
