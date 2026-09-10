package com.shop.platform.logistics.model;

import io.swagger.v3.oas.annotations.media.Schema;

/** 异常单状态。未结单是客服的待办，已结单只是历史痕迹（可结单原因见 {@code shipment_issues.detail}）。 */
@Schema(enumAsRef = true)
public enum ShipmentIssueStatus {

    /** 待处理：包裹还卡着 */
    OPEN,

    /** 已结：包裹已到终态，或客服手动标记处理完 */
    RESOLVED
}
