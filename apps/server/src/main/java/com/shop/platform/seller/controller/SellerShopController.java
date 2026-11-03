package com.shop.platform.seller.controller;

import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.seller.dto.CloseShopRequest;
import com.shop.platform.seller.dto.RenameShopRequest;
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
 * <p>改名与关店是动整家店的动作，各持有自己的码（{@code shop:update} / {@code shop:close}），
 * 不可转授——「能管子账号的人」和「能关掉整家店的人」不该天然是同一个。
 */
@RestController
@RequestMapping("/api/seller")
public class SellerShopController {

    private final SellerOnboardingService onboarding;
    private final Authorizer authorizer;

    public SellerShopController(SellerOnboardingService onboarding, Authorizer authorizer) {
        this.onboarding = Objects.requireNonNull(onboarding, "onboarding");
        this.authorizer = Objects.requireNonNull(authorizer, "authorizer");
    }

    /** 改店名。 */
    @PutMapping("/shop/name")
    public void renameShop(@Valid @RequestBody RenameShopRequest request) {
        AccessScope.Seller scope = authorizer.seller(Permission.SHOP_UPDATE);
        onboarding.renameShop(
                scope.merchantId(), scope.operatorId(), request.name().trim());
    }

    /** 关店（终态）。经 ShopClosed 事件级联下架该店在线商品；在途订单照常履约。 */
    @PostMapping("/shop/close")
    public void closeShop(@Valid @RequestBody CloseShopRequest request) {
        AccessScope.Seller scope = authorizer.seller(Permission.SHOP_CLOSE);
        onboarding.closeShop(scope.merchantId(), scope.operatorId(), request.reason());
    }

    /** 入驻被拒后重新提交审核。治理侧权威状态是 rejected 才会受理。 */
    @PostMapping("/onboarding/resubmit")
    public void resubmit() {
        authorizer.seller();
        onboarding.resubmit(authorizer.current().merchantId());
    }
}
