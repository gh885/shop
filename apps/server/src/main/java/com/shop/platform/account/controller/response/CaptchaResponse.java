package com.shop.platform.account.controller.response;

import static io.swagger.v3.oas.annotations.media.Schema.RequiredMode.REQUIRED;

import io.swagger.v3.oas.annotations.media.Schema;

/** 图形验证码出参：前端渲染图（base64 data URI），校验时回传 id + 用户输入 */
public record CaptchaResponse(
        @Schema(requiredMode = REQUIRED) String captchaId, @Schema(requiredMode = REQUIRED) String image) {}
