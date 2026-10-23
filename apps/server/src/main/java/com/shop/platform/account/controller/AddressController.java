package com.shop.platform.account.controller;

import com.shop.platform.account.dto.AddressParseRequest;
import com.shop.platform.account.dto.AddressRequest;
import com.shop.platform.account.service.AddressParseResult;
import com.shop.platform.account.service.AddressService;
import com.shop.platform.account.service.AddressView;
import com.shop.platform.infra.security.Authorizer;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
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
 * 买家收货地址入口。全部需登录——地址是个人数据，匿名连「有没有地址」都不该被探到。
 *
 * <p>不判权限点：买家没有权限体系，边界是「这条地址是不是我的」，归属校验在 service 里做（404 防枚举）。
 */
@RestController
@RequestMapping("/api/addresses")
public class AddressController {

    private final AddressService addresses;
    private final Authorizer authorizer;

    public AddressController(AddressService addresses, Authorizer authorizer) {
        this.addresses = addresses;
        this.authorizer = authorizer;
    }

    /** 我的收货地址列表：默认置顶 */
    @GetMapping
    public List<AddressView> listAddresses() {
        return addresses.list(buyerId());
    }

    /** 地址详情（结算页反显用） */
    @GetMapping("/{id}")
    public AddressView getAddressDetail(@PathVariable UUID id) {
        return addresses.detail(buyerId(), id);
    }

    /** 新增收货地址 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AddressView createAddress(@Valid @RequestBody AddressRequest req) {
        return addresses.create(buyerId(), req);
    }

    /** 修改收货地址 */
    @PutMapping("/{id}")
    public AddressView updateAddress(@PathVariable UUID id, @Valid @RequestBody AddressRequest req) {
        return addresses.update(buyerId(), id, req);
    }

    /** 删除收货地址 */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAddress(@PathVariable UUID id) {
        addresses.delete(buyerId(), id);
    }

    /** 设为默认地址：每买家至多一个默认 */
    @PutMapping("/{id}/default")
    public AddressView setDefaultAddress(@PathVariable UUID id) {
        return addresses.setDefault(buyerId(), id);
    }

    /** 取消默认地址：允许该买家无默认地址 */
    @DeleteMapping("/{id}/default")
    public AddressView unsetDefaultAddress(@PathVariable UUID id) {
        return addresses.unsetDefault(buyerId(), id);
    }

    /** 智能粘贴：解析收货文本为结构化字段（纯文本处理，不落库） */
    @PostMapping("/parse")
    public AddressParseResult parseAddress(@Valid @RequestBody AddressParseRequest req) {
        return addresses.parse(req.text());
    }

    private UUID buyerId() {
        return authorizer.current().operatorId();
    }
}
