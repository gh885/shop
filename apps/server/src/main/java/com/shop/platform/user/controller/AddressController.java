package com.shop.platform.user.controller;

import com.shop.platform.common.UserIdHolder;
import com.shop.platform.user.dto.AddressParseRequest;
import com.shop.platform.user.dto.AddressRequest;
import com.shop.platform.user.mapper.Address;
import com.shop.platform.user.service.AddressService;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.OffsetDateTime;
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
    public AddressResponse createAddress(@Valid @RequestBody AddressRequest req) {
        return AddressResponse.from(addressService.create(UserIdHolder.get(), req));
    }

    /** 智能粘贴：解析收货文本为结构化字段（无需入库，纯文本处理） */
    @PostMapping("/parse")
    public AddressParseResponse parseAddress(@Valid @RequestBody AddressParseRequest req) {
        return AddressParseResponse.from(addressService.parse(req.text()));
    }

    /** 我的收货地址列表：默认地址置顶 */
    @GetMapping
    public List<AddressResponse> listAddresses() {
        return AddressResponse.from(addressService.list(UserIdHolder.get()));
    }

    /** 地址详情（结算页反显用） */
    @GetMapping("/{id}")
    public AddressResponse getAddressDetail(@PathVariable UUID id) {
        return AddressResponse.from(addressService.detail(UserIdHolder.get(), id));
    }

    /** 修改收货地址 */
    @PutMapping("/{id}")
    public AddressResponse updateAddress(@PathVariable UUID id, @Valid @RequestBody AddressRequest req) {
        return AddressResponse.from(addressService.update(UserIdHolder.get(), id, req));
    }

    /** 删除收货地址（软删，返回 204） */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteAddress(@PathVariable UUID id) {
        addressService.delete(UserIdHolder.get(), id);
    }

    /** 设为默认地址：每用户至多一个默认 */
    @PutMapping("/{id}/default")
    public AddressResponse setDefaultAddress(@PathVariable UUID id) {
        return AddressResponse.from(addressService.setDefault(UserIdHolder.get(), id));
    }

    /** 取消默认地址：允许该用户无默认地址 */
    @DeleteMapping("/{id}/default")
    public AddressResponse unsetDefaultAddress(@PathVariable UUID id) {
        return AddressResponse.from(addressService.unsetDefault(UserIdHolder.get(), id));
    }

    /**
     * 地址出参：字段镜像实体现状（前端 zod schema 逐字段严格校验，只减不增），
     * 刻意不吐 deletedAt（软删内部标记）。HTTP 契约与存储模型在此解耦。
     */
    public record AddressResponse(
            UUID id,
            UUID userId,
            String receiverName,
            String phone,
            String regionCode,
            String province,
            String city,
            String district,
            String detail,
            String label,
            Boolean isDefault,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {

        static AddressResponse from(Address a) {
            return new AddressResponse(
                    a.getId(),
                    a.getUserId(),
                    a.getReceiverName(),
                    a.getPhone(),
                    a.getRegionCode(),
                    a.getProvince(),
                    a.getCity(),
                    a.getDistrict(),
                    a.getDetail(),
                    a.getLabel(),
                    a.getIsDefault(),
                    a.getCreatedAt(),
                    a.getUpdatedAt());
        }

        static List<AddressResponse> from(List<Address> list) {
            return list.stream().map(AddressResponse::from).toList();
        }
    }
}
