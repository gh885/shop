package com.shop.platform.auth.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.infra.qiniu.UploadTicket;
import io.swagger.v3.oas.annotations.media.Schema;

/** 图片上传凭证：前端把文件 PUT 到 uploadUrl，请求头带 Authorization: UpToken <token>；传完用 url/key 保存 */
public record AvatarTicketResponse(
        @Schema(requiredMode = REQUIRED) String uploadUrl,
        @Schema(requiredMode = REQUIRED) String key,
        @Schema(requiredMode = REQUIRED) String token,
        @Schema(requiredMode = REQUIRED) String url) {

    public static AvatarTicketResponse from(UploadTicket t) {
        return new AvatarTicketResponse(t.uploadUrl(), t.key(), t.token(), t.url());
    }
}
