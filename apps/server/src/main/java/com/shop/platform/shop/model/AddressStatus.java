package com.shop.platform.shop.model;

import io.swagger.v3.oas.annotations.media.Schema;

/**
 * 地址本体状态：启用 / 停用。
 *
 * <p>DB 存 {@code name()}（varchar）。停用不删，软删由 deletedAt 承担；停用的是「这个地址暂时不用但可能复用」。
 */
@Schema(enumAsRef = true)
public enum AddressStatus {

    /** 启用（可被默认/快照解析） */
    ACTIVE,

    /** 停用（不参与解析，但保留地址本体） */
    DISABLED
}
