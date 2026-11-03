package com.shop.platform.seller.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.CurrentOperator;
import com.shop.platform.seller.mapper.SellerMeMapper;
import com.shop.platform.seller.service.SellerLocaleService;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 「我是谁」。卖家端每个页面都要当前店铺 id（运费模板按店查、商品归属按店判），
 * 而登录只回令牌、令牌里只有 merchantId——没有这个端点，前端只能靠猜或从别处反推。
 *
 * <p>与 admin 的 {@code /api/staff/me} 是同一类缺口，两边都在重写期漏掉了；
 * 只回身份、所属店铺与语言偏好，不回权限清单（权限闸门在后端每个接口上，前端不按权限裁剪）。
 *
 * <p><b>语言偏好为什么在这里读。</b> 前端登录后要把库里的偏好写回本地 cookie，
 * 否则换台机器看到的是浏览器默认语言而不是用户选过的那个。放在 me 里一次带回，
 * 不另开 {@code GET /locale}——同一次请求能拿全的东西不该拆成两个往返。
 */
@RestController
@RequestMapping("/api/seller")
public class SellerMeController {

    private final SellerMeMapper mapper;
    private final SellerLocaleService locale;
    private final Authorizer authorizer;

    public SellerMeController(SellerMeMapper mapper, SellerLocaleService locale, Authorizer authorizer) {
        this.mapper = Objects.requireNonNull(mapper, "mapper");
        this.locale = Objects.requireNonNull(locale, "locale");
        this.authorizer = Objects.requireNonNull(authorizer, "authorizer");
    }

    @GetMapping("/me")
    public SellerMe sellerMe() {
        authorizer.seller();
        CurrentOperator operator = authorizer.current();
        // 一家店一个账号：merchant 下的 active 店铺；没有店的账号返回 shop 为 null，
        // 前端据此走「先建店」而不是白屏
        SellerMeMapper.ShopRow shop =
                mapper.findActiveShop(operator.merchantId()).orElse(null);
        return new SellerMe(
                operator.operatorId(),
                operator.merchantId(),
                shop == null ? null : shop.id(),
                shop == null ? null : shop.name(),
                locale.find(operator.operatorId()),
                // 主账号判定与权限清单：子账号管理入口的门禁、菜单按权限裁剪都从这里读
                mapper.isPrimary(operator.operatorId()).orElse(false),
                operator.permissions().stream().sorted().toList(),
                // 入驻审核状态：pending/rejected 时前端据此引导，不在别处再开一个点查
                mapper.onboardingStatus(operator.merchantId()).orElse(null),
                // 被拒理由与状态一次带回：卖家端要靠它知道该改什么再重提
                mapper.onboardingRejectReason(operator.merchantId()).orElse(null));
    }

    /**
     * 当前卖家身份。
     *
     * @param shopId 当前店铺；null = 这个账号名下还没有启用中的店
     * @param preferredLocale 语言偏好；null = 没表过态（前端落平台默认）
     * @param onboardingStatus 入驻审核状态（pending / approved / rejected）；null = 种子商家没有入驻记录
     * @param onboardingRejectReason 被拒理由；仅 rejected 时非空
     */
    public record SellerMe(
            UUID operatorId,
            UUID merchantId,
            @Schema(nullable = true) UUID shopId,
            @Schema(nullable = true) String shopName,
            @Schema(nullable = true) String preferredLocale,
            boolean isPrimary,
            List<String> permissions,
            @Schema(nullable = true) String onboardingStatus,
            @Schema(nullable = true) String onboardingRejectReason) {}
}
