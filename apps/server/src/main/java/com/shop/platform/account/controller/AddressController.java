package com.shop.platform.account.controller;

import com.shop.platform.account.dto.AddressParseRequest;
import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressParseResult;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.infra.web.CurrentUser;
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

@Tag(name = "addresses", description = "买家收货地址（全部需登录）")
@RestController
@RequestMapping("/user/addresses")
@RequiredArgsConstructor
public class AddressController {

    private final AddressService addressService;

    /** 新增收货地址 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AddressView createAddress(@CurrentUser UUID userId, @Valid @RequestBody AddressRequest req) {
        return addressService.create(userId, req);
    }

    /** 智能粘贴：解析收货文本为结构化字段（无需入库，纯文本处理） */
    @PostMapping("/parse")
    public AddressParseResult parseAddress(@Valid @RequestBody AddressParseRequest req) {
        return addressService.parse(req.text());
    }

    /** 我的收货地址列表：默认地址置顶 */
    @GetMapping
    public List<AddressView> listAddresses(@CurrentUser UUID userId) {
        return addressService.list(userId);
    }

    /** 地址详情（结算页反显用） */
    @GetMapping("/{id}")
    public AddressView getAddressDetail(@CurrentUser UUID userId, @PathVariable UUID id) {
        return addressService.detail(userId, id);
    }

    /** 修改收货地址 */
    @PutMapping("/{id}")
    public AddressView updateAddress(
            @CurrentUser UUID userId, @PathVariable UUID id, @Valid @RequestBody AddressRequest req) {
        return addressService.update(userId, id, req);
    }

    /** 删除收货地址（软删，返回 204） */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAddress(@CurrentUser UUID userId, @PathVariable UUID id) {
        addressService.delete(userId, id);
    }

    /** 设为默认地址：每用户至多一个默认 */
    @PutMapping("/{id}/default")
    public AddressView setDefaultAddress(@CurrentUser UUID userId, @PathVariable UUID id) {
        return addressService.setDefault(userId, id);
    }

    /** 取消默认地址：允许该用户无默认地址 */
    @DeleteMapping("/{id}/default")
    public AddressView unsetDefaultAddress(@CurrentUser UUID userId, @PathVariable UUID id) {
        return addressService.unsetDefault(userId, id);
    }
}
