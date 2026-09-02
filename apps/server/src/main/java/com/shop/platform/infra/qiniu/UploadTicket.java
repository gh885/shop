package com.shop.platform.infra.qiniu;

/**
 * 浏览器直传凭证（共享层值对象，与 {@code TokenPair} 同一性质：多模块 controller 复用的技术形状）。
 *
 * <p>前端拿到后把文件字节 PUT 到 {@code uploadUrl}，请求头带 {@code Authorization: UpToken <token>}；
 * 传完用 {@code key}（存库）与 {@code url}（展示）关联业务实体。文件流不经过应用服务器。
 *
 * @param uploadUrl 直传目标地址（上传域名 + key）
 * @param key 资源 key，落库字段
 * @param token 上传凭证，一次一 key
 * @param url 公网访问地址
 */
public record UploadTicket(String uploadUrl, String key, String token, String url) {}
