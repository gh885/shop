package com.shop.platform.logistics.service;

import com.shop.platform.common.BusinessException;
import com.shop.platform.common.Validate;
import com.shop.platform.logistics.mapper.Carrier;
import com.shop.platform.logistics.mapper.CarrierMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/**
 * 承运商解析 —— 把"各种输入"收敛成一个展示名。
 *
 * <p>两个入口的输入形态不同（卖家发货给字典 code、买家回寄可能只有手填名字），
 * 但落库时必须是同一个口径：<b>能对上字典就用字典名，对不上就保留原文</b>。
 * 收成一个组件是为了让两处行为一致——"同一家顺丰三种写法"正是这么长出来的。
 */
@Component
@RequiredArgsConstructor
public class CarrierResolver {

    private final CarrierMapper carrierMapper;

    /**
     * 按字典 code 解析展示名（卖家发货：只有 code，没有手填名字可兜底）。
     *
     * @param carrierCode 稳定标识；必须在字典里且未被停用（前端传错就是 400）
     */
    public String resolveName(String carrierCode) {
        return resolveName(carrierCode, null);
    }

    /**
     * 解析承运商展示名。
     *
     * @param carrierCode 稳定标识；非空时必须在字典里且未被停用（给错就是前端传错，直接 400）
     * @param carrierName 兜底名称（买家回寄手填），可为空——但两者都空时不可解析
     * @return 字典名（命中）或原文（未命中）
     */
    public String resolveName(String carrierCode, String carrierName) {
        if (carrierCode != null && !carrierCode.isBlank()) {
            Carrier carrier = carrierMapper.selectByCode(carrierCode);
            Validate.isTrue(carrier != null, "快递公司不存在");
            Validate.isTrue(Boolean.TRUE.equals(carrier.getEnabled()), "该快递公司已停用");
            return carrier.getName();
        }
        if (carrierName == null || carrierName.isBlank()) {
            throw BusinessException.badRequest("请选择或填写快递公司");
        }
        Carrier matched = carrierMapper.selectByName(carrierName);
        return matched == null ? carrierName : matched.getName();
    }
}
