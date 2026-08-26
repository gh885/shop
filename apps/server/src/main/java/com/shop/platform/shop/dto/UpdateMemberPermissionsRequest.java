package com.shop.platform.shop.dto;

import java.util.List;

/** 店主调整子账号权限（全量替换）；白名单校验在 SellerGrants */
public record UpdateMemberPermissionsRequest(List<String> permissions) {}
