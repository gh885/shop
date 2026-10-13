package com.shop.platform.shop.dto;

import java.util.List;

/** 店主调整子账号权限（全量替换；null / 空 = 最小权限空集），下一请求即生效 */
public record UpdateSubaccountPermissionsRequest(List<String> permissions) {}
