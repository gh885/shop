package com.shop.platform.shop.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import com.shop.platform.shop.controller.response.ShippingTemplateResponse;
import com.shop.platform.shop.dto.ShippingTemplateRequest;
import com.shop.platform.shop.service.ShippingTemplateService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 运费模板设置（授权要求 SHIPPING_MANAGE）。shopId 从店铺上下文（X-Shop-Id，ShopMembershipFilter
 * 校验成员身份）取，前端不传店 ID。
 *
 * <p>只有 GET / PUT 两个端点：模板是每店一份的整体承诺（覆盖式保存），
 * 没有「再建一个模板」这回事，故不是列表资源。未设置时 GET 返回 404，卖家侧据此进入新建态。
 */
@Tag(name = "seller-shipping", description = "运费模板（按收货地区与件数计费）")
@RestController
@RequestMapping("/seller/shipping-template")
@RequiredArgsConstructor
@RequirePermission(Permissions.SHIPPING_MANAGE)
public class SellerShippingTemplateController {

    private final ShippingTemplateService shippingTemplateService;

    /** 本店运费模板：默认规则 + 指定地区规则 + 不配送地区；未设置给 404 */
    @GetMapping
    public ShippingTemplateResponse getShippingTemplate(@CurrentShop UUID shopId) {
        return ShippingTemplateResponse.from(shippingTemplateService.require(shopId));
    }

    /** 保存运费模板（覆盖式：整份提交，规则与地区整批重建） */
    @PutMapping
    public ShippingTemplateResponse saveShippingTemplate(
            @CurrentShop UUID shopId, @Valid @RequestBody ShippingTemplateRequest req) {
        return ShippingTemplateResponse.from(shippingTemplateService.save(shopId, req));
    }
}
