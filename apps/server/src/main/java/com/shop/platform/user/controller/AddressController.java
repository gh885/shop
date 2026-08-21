package com.shop.platform.user.controller;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.user.dto.AddressParseRequest;
import com.shop.platform.user.dto.AddressParseResult;
import com.shop.platform.user.dto.AddressRequest;
import com.shop.platform.user.mapper.Address;
import com.shop.platform.user.service.AddressService;
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

@RestController
@RequestMapping("/user/addresses")
@RequiredArgsConstructor
public class AddressController {

    private final AddressService addressService;

    /** 新增收货地址 */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Address create(@Valid @RequestBody AddressRequest req) {
        return addressService.create(UserIdHolder.get(), req);
    }

    /** 智能粘贴：解析收货文本为结构化字段（无需入库，纯文本处理） */
    @PostMapping("/parse")
    public AddressParseResult parse(@Valid @RequestBody AddressParseRequest req) {
        return addressService.parse(req.text());
    }

    /** 我的收货地址列表：默认地址置顶 */
    @GetMapping
    public List<Address> list() {
        return addressService.list(UserIdHolder.get());
    }

    /** 地址详情（结算页反显用） */
    @GetMapping("/{id}")
    public Address detail(@PathVariable UUID id) {
        return addressService.detail(UserIdHolder.get(), id);
    }

    /** 修改收货地址 */
    @PutMapping("/{id}")
    public Address update(@PathVariable UUID id, @Valid @RequestBody AddressRequest req) {
        return addressService.update(UserIdHolder.get(), id, req);
    }

    /** 删除收货地址（软删，返回 204） */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) {
        addressService.delete(UserIdHolder.get(), id);
    }

    /** 设为默认地址：每用户至多一个默认 */
    @PutMapping("/{id}/default")
    public Address setDefault(@PathVariable UUID id) {
        return addressService.setDefault(UserIdHolder.get(), id);
    }

    /** 取消默认地址：允许该用户无默认地址 */
    @DeleteMapping("/{id}/default")
    public Address unsetDefault(@PathVariable UUID id) {
        return addressService.unsetDefault(UserIdHolder.get(), id);
    }
}
