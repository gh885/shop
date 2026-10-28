# media — 素材

> 无域（技术适配）· schema `media` · 部分开工（七牛直传凭证）

```yaml
module: media
layer: 无域
schema: media
status: partial
depends_on: []
emits: []
consumes: []
```

## 职责

图片 / 视频上传、转码、CDN。

## 现状

商品图的**七牛 Kodo 直传凭证**已落地：

- `POST /api/seller/media/image-tickets?ext=jpg`——判 `PRODUCT_WRITE`，签一张 scope 绑死 key 的
  上传凭证（10 分钟有效、fsizeLimit 10MB、insertOnly），白名单 jpg/jpeg/png/webp/gif/avif
- `QiniuClient` 只调 SDK 的本地签名 API（Auth/StringMap），okhttp 已从依赖排除；
  `QiniuClientTest` 用真实 Auth 签凭证做回归
- 密钥在 `shop.media.qiniu.*`（本地进 `apps/server/.env`），五项任缺其一端点整体 503
- **返回相对 key，不返回完整 URL**：入库存 key（`spu_media.url`），展示由前端拼
  `publicBaseUrl`——换域名不坏历史数据

## 拥有什么

`asset`（未建表：上传即走即弃，asset 数据在对象存储，库不保管）

## 边界

存储外采七牛 Kodo，前端浏览器直传、后端只发凭证。（早先设想本地 MinIO / 接口按 S3 写，
实际接入走了七牛：`.env`、pom、前端直传三处都是七牛，以现实为准。）

## 层与依赖

层：通用域。层间只向下依赖，核心域内部的 DAG 见
[module-map.md](../../../../../../../../../docs/domain/module-map.md) 第 6 节。
