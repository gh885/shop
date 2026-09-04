package com.shop.platform.product.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import com.shop.platform.infra.qiniu.UploadTicket;
import io.swagger.v3.oas.annotations.media.Schema;

/** 商品图上传凭证：前端 PUT 到 uploadUrl（Authorization: UpToken <token>），传完用 url/key 存进商品图字段 */
public record ImageTicketResponse(
        @Schema(requiredMode = REQUIRED) String uploadUrl,
        @Schema(requiredMode = REQUIRED) String key,
        @Schema(requiredMode = REQUIRED) String token,
        @Schema(requiredMode = REQUIRED) String url) {

    /** 镜像 infra 共享值对象 {@link UploadTicket}：拼装逻辑只留一份，HTTP 边界保留自家契约 */
    public static ImageTicketResponse from(UploadTicket t) {
        return new ImageTicketResponse(t.uploadUrl(), t.key(), t.token(), t.url());
    }
}
