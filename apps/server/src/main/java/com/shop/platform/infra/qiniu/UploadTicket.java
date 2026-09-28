package com.shop.platform.infra.qiniu;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 浏览器直传凭证（共享层值对象，与 {@code TokenPair} 同一性质：多模块 controller 复用的技术形状）。
 *
 * <p>本 record 即 HTTP 出参（avatar-ticket / image-ticket 直接返回，无独立 Response 镜像）。
 *
 * <p>前端拿到后 POST {@code multipart/form-data} 到 {@code uploadUrl}，表单含 {@code token}（凭证）与
 * {@code file}（文件字节）两个字段（key 已编码进 token，无需单独传）；不能走浏览器 PUT——七牛 Kodo
 * 上传接口对 PUT 返回 405「only allow POST method」〔实测〕。建议前端 fetch 时也把 {@code key} 一并带上
 * （七牛允许 token 含 key，同时提供 key 字段不冲突）。传完用 {@code key}（存库）与 {@code url}（展示）
 * 关联业务实体。文件流不经过应用服务器。
 *
 * @param uploadUrl 直传目标地址（上传域名 + key，作为 POST multipart 目标）
 * @param key 资源 key，落库字段
 * @param token 上传凭证，一次一 key
 * @param url 公网访问地址
 */
public record UploadTicket(
        @Schema(requiredMode = REQUIRED) String uploadUrl,
        @Schema(requiredMode = REQUIRED) String key,
        @Schema(requiredMode = REQUIRED) String token,
        @Schema(requiredMode = REQUIRED) String url) {}
