package com.shop.platform.seller.controller;

import com.shop.platform.infra.security.AccessScope;
import com.shop.platform.infra.security.Authorizer;
import com.shop.platform.infra.security.Permission;
import com.shop.platform.seller.dto.ShippingTemplateRequest;
import com.shop.platform.seller.service.ShippingTemplateService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 运费模板的商家入口。
 *
 * <p>四个动作分成两类，路径上就看得出来：改内容（{@code POST} / {@code PUT}）与改状态
 * （{@code .../activate}、{@code .../archive}）。合成一个 {@code PUT} 带 {@code status} 字段也能做，
 * 但那样"启用"就不再是一个能被审计、能被前端单独置灰的动作。
 *
 * <p>判权两道：{@code SHIPPING_MANAGE} 权限点决定"能不能改运费"，
 * 商家归属与店铺数据范围在 service 里判——功能权限对了但忘了归属，商家就能改别人店的运费。
 */
@RestController
@RequestMapping("/api/seller/shipping-templates")
public class SellerShippingTemplateController {

    private final ShippingTemplateService templates;
    private final Authorizer authorizer;

    public SellerShippingTemplateController(ShippingTemplateService templates, Authorizer authorizer) {
        this.templates = templates;
        this.authorizer = authorizer;
    }

    /** 列表。{@code shopId} 可空——商家开两家店时先看全部，再按店筛。 */
    @GetMapping
    public List<ShippingTemplateService.TemplateView> listTemplates(@RequestParam(required = false) UUID shopId) {
        AccessScope.Seller scope = authorizer.seller(Permission.SHIPPING_TEMPLATE_CONFIGURE);
        return templates.list(scope.merchantId(), shopId);
    }

    @GetMapping("/{id}")
    public ShippingTemplateService.TemplateView getTemplate(@PathVariable UUID id) {
        AccessScope.Seller scope = authorizer.seller(Permission.SHIPPING_TEMPLATE_CONFIGURE);
        return templates.get(scope, id);
    }

    /** 新建。落成 draft，不会立刻影响算价——启用是下一个动作。 */
    @PostMapping
    public ShippingTemplateService.TemplateView createTemplate(@Valid @RequestBody ShippingTemplateRequest request) {
        AccessScope.Seller scope = authorizer.seller(Permission.SHIPPING_TEMPLATE_CONFIGURE);
        return templates.create(scope, request);
    }

    @PutMapping("/{id}")
    public ShippingTemplateService.TemplateView updateTemplate(
            @PathVariable UUID id, @Valid @RequestBody ShippingTemplateRequest request) {
        AccessScope.Seller scope = authorizer.seller(Permission.SHIPPING_TEMPLATE_CONFIGURE);
        return templates.update(scope, id, request);
    }

    @PostMapping("/{id}/activate")
    public ShippingTemplateService.TemplateView activateTemplate(@PathVariable UUID id) {
        AccessScope.Seller scope = authorizer.seller(Permission.SHIPPING_TEMPLATE_CONFIGURE);
        return templates.activate(scope, id);
    }

    @PostMapping("/{id}/archive")
    public ShippingTemplateService.TemplateView archiveTemplate(@PathVariable UUID id) {
        AccessScope.Seller scope = authorizer.seller(Permission.SHIPPING_TEMPLATE_CONFIGURE);
        return templates.archive(scope, id);
    }
}
