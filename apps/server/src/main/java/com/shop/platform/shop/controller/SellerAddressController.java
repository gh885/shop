package com.shop.platform.shop.controller;

import com.shop.platform.common.Permissions;
import com.shop.platform.infra.security.authz.RequirePermission;
import com.shop.platform.infra.web.CurrentShop;
import com.shop.platform.shop.controller.response.MerchantAddressResponse;
import com.shop.platform.shop.dto.MerchantAddressRequest;
import com.shop.platform.shop.service.MerchantAddressService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * 商家收货地址管理（授权要求 ADDRESS_MANAGE，读随写权）。shopId 从店铺上下文（X-Shop-Id，
 * ShopMembershipFilter 校验成员身份）取，前端不传店 ID；越店访问在 service 层按 shop_id 校验，一律 404。
 *
 * <p>单表「地址本体 + 默认发货/默认退货」模型：一条地址可同时承担发货与退货，面单寄件人 = companyName（公司名称）。
 */
@Tag(name = "seller-addresses", description = "商家发货/退货地址管理")
@RestController
@RequestMapping("/seller/addresses")
@RequiredArgsConstructor
@RequirePermission(Permissions.ADDRESS_MANAGE)
public class SellerAddressController {

    private final MerchantAddressService addressService;

    /** 本店地址库列表：默认发货/退货置顶 */
    @GetMapping
    public List<MerchantAddressResponse> listAddresses(@CurrentShop UUID shopId) {
        return MerchantAddressResponse.from(addressService.list(shopId));
    }

    /** 新增地址（可同时标记默认发货/默认退货） */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public MerchantAddressResponse createAddress(
            @CurrentShop UUID shopId, @Valid @RequestBody MerchantAddressRequest req) {
        return MerchantAddressResponse.from(addressService.create(shopId, req));
    }

    /** 地址详情（编辑面板反显用） */
    @GetMapping("/{id}")
    public MerchantAddressResponse getAddressDetail(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return MerchantAddressResponse.from(addressService.detail(shopId, id));
    }

    /** 编辑地址 */
    @PutMapping("/{id}")
    public MerchantAddressResponse updateAddress(
            @CurrentShop UUID shopId, @PathVariable UUID id, @Valid @RequestBody MerchantAddressRequest req) {
        return MerchantAddressResponse.from(addressService.update(shopId, id, req));
    }

    /** 删除地址（软删），返回 204 */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAddress(@CurrentShop UUID shopId, @PathVariable UUID id) {
        addressService.delete(shopId, id);
    }

    /** 设为默认发货地址：每店至多一个 */
    @PutMapping("/{id}/default-ship")
    public MerchantAddressResponse setDefaultShip(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return MerchantAddressResponse.from(addressService.setDefaultShip(shopId, id));
    }

    /** 设为默认退货地址：每店至多一个 */
    @PutMapping("/{id}/default-return")
    public MerchantAddressResponse setDefaultReturn(@CurrentShop UUID shopId, @PathVariable UUID id) {
        return MerchantAddressResponse.from(addressService.setDefaultReturn(shopId, id));
    }
}
