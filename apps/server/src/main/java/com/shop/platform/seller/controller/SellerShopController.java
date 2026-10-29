package com.shop.platform.seller.controller;

import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.seller.dto.CloseShopRequest;
import com.shop.platform.seller.dto.RenameShopRequest;
import com.shop.platform.seller.mapper.SellerMeMapper;
import com.shop.platform.seller.service.SellerOnboardingService;
import jakarta.validation.Valid;
import java.util.Objects;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 店铺生命周期：改名、关店、入驻重提。
 *
 * <p><b>改名与关店主账号专属</b>，不走权限码：店铺的生死是账号树根的决定，子账号将来接上登录后
 * 也不该进可授予清单（与 {@code SETTLEMENT_APPROVE} 同一归谬——能管客服的人不该能关掉整家店）。
 * 当前子账号本就没有登录路径，isPrimary 是唯一闸门，够用且不引入第四种语义。
 */
@RestController
@RequestMapping("/api/seller")
public class SellerShopController {

    private final SellerOnboardingService onboarding;
    private final SellerMeMapper me;
    private final Authorizer authorizer;

    public SellerShopController(SellerOnboardingService onboarding, SellerMeMapper me, Authorizer authorizer) {
        this.onboarding = Objects.requireNonNull(onboarding, "onboarding");
        this.me = Objects.requireNonNull(me, "me");
        this.authorizer = Objects.requireNonNull(authorizer, "authorizer");
    }

    /** 改店名。 */
    @PutMapping("/shop/name")
    public void renameShop(@Valid @RequestBody RenameShopRequest request) {
        requirePrimary();
        var operator = authorizer.current();
        onboarding.renameShop(
                operator.merchantId(), operator.operatorId(), request.name().trim());
    }

    /** 关店（终态）。经 ShopClosed 事件级联下架该店在线商品；在途订单照常履约。 */
    @PostMapping("/shop/close")
    public void closeShop(@Valid @RequestBody CloseShopRequest request) {
        requirePrimary();
        var operator = authorizer.current();
        onboarding.closeShop(operator.merchantId(), operator.operatorId(), request.reason());
    }

    /** 入驻被拒后重新提交审核。治理侧权威状态是 rejected 才会受理。 */
    @PostMapping("/onboarding/resubmit")
    public void resubmit() {
        onboarding.resubmit(authorizer.current().merchantId());
    }

    private void requirePrimary() {
        if (!me.isPrimary(authorizer.current().operatorId()).orElse(false)) {
            throw com.shop.platform.common.BusinessException.forbidden("PRIMARY_ONLY", "只有主账号可以执行此操作");
        }
    }
}
