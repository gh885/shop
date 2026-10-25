package com.shop.platform.promotion.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * 新建 / 编辑促销规则的入参。
 *
 * <p><b>金额单位是分。</b>和库里所有金额列一致，也和 {@code AppliedRule} 一致。
 *
 * <p>{@code rateBp} 与 {@code fixedAmount} 二选一，另一个必须为 null——库里
 * {@code ck_promotion_benefit} 用 {@code num_nonnulls(...) = 1} 卡死。两个都给的话，
 * "减 10% 再减 20 元"到底是叠加还是覆盖没有定义，所以不猜。
 *
 * <p>枚举类字段一律收字符串（{@code scope} / {@code bearer} / {@code baseMode}）：库里存小写，
 * 前端照着写；绑成枚举的话大小写不对会变成"反序列化失败"，说不清是哪个字段。
 */
public record RuleRequest(
        @NotBlank @Size(max = 100) String name,

        /** 只用于证据展示（如 {@code ORDER_THRESHOLD_OFF}），不参与算钱。 */
        @NotBlank @Size(max = 50) String type,
        @NotBlank String scope,
        @NotBlank String bearer,

        /** 门槛，分。{@code null} = 无门槛。 */
        @Positive Long threshold,

        /** 折扣，万分比。2000 = 8 折。 */
        @Min(1) @Max(10_000) Integer rateBp,

        /** 定额减免，分。 */
        @Positive Long fixedAmount,
        @NotBlank String baseMode,

        /** 互斥组。同组只取门槛通过且优先级最高的第一条。 */
        @Size(max = 50) String mutexGroup,

        /** 数值小 = 优先级高。 */
        @Min(0) @Max(10_000) Integer priority,

        /** {@code null} = 全类目。 */
        List<UUID> categoryIds,
        Instant startsAt,
        Instant endsAt) {}
