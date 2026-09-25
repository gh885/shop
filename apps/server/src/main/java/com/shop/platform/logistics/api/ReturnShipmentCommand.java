package com.shop.platform.logistics.api;

import com.shop.platform.infra.db.DuplicateKeys;
import com.shop.platform.logistics.mapper.Shipment;
import com.shop.platform.logistics.mapper.ShipmentMapper;
import com.shop.platform.logistics.mapper.TrackingNodeMapper;
import com.shop.platform.logistics.model.ShipmentDirection;
import com.shop.platform.logistics.model.ShipmentStatus;
import com.shop.platform.logistics.service.CarrierResolver;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 退货回寄命令（跨模块消费）——aftersale 在买家填回寄物流单时同步调用。
 *
 * <p>同事务：售后单的时间线和回寄包裹一起成或一起败。包裹用 {@link ShipmentDirection#RETURN} 与正向区分，
 * 之后它自动享有正向的一切——承运商推送按运单号就能匹配到它（{@code selectByTrackingNo} 不看方向）、
 * 轮询扫描不看方向、买家「查看物流」里会看到它的轨迹。这就是"逆向复用同一套模型"的全部含义。
 *
 * <p>面单寄件人（{@code ship_from_*}）逆向不填：回寄面单是买家在线下/快递网点填的，
 * 平台没有也不该有这份数据。买家收货地址在订单快照里，不在这里复制一份。
 */
@Component
@RequiredArgsConstructor
public class ReturnShipmentCommand {

    private final ShipmentMapper shipmentMapper;

    /** 回寄改单要连旧包裹的轨迹节点一起作废（节点挂在 shipment_id 上，不先删会留下指向已删包裹的孤儿） */
    private final TrackingNodeMapper trackingNodeMapper;

    /** 承运商名称与卖家发货同口径（命中字典用字典名，否则保留原文） */
    private final CarrierResolver carrierResolver;

    /**
     * 记一次退货回寄。
     *
     * @param carrierName 承运商名称（买家手填）；公司名必填，carrierCode 可空
     * @return 落成的包裹（含归一后的承运商名与运单号）
     */
    @Transactional
    public ReturnShipmentView record(
            UUID orderId, UUID userId, UUID shopId, String carrierCode, String carrierName, String trackingNo) {
        String resolvedName = carrierResolver.resolveName(carrierCode, carrierName);
        Shipment shipment = Shipment.builder()
                .orderId(orderId)
                .userId(userId)
                .shopId(shopId)
                .direction(ShipmentDirection.RETURN)
                .carrierCode(carrierCode)
                .carrierName(resolvedName)
                .trackingNo(trackingNo)
                // 回寄包裹起步就是"已寄出"：买家填单号时包裹已经在他手里交给承运商了
                .status(ShipmentStatus.PICKED_UP)
                .shippedAt(OffsetDateTime.now())
                .build();
        // 一个运单号只属于一个包裹：拿别人的回寄单号来填是常见误操作（也可能是撞库式试探）
        DuplicateKeys.conflictOnDuplicate(() -> shipmentMapper.insert(shipment), "该运单号已被使用，请核对后重填");
        return new ReturnShipmentView(
                shipment.getId(), shipment.getCarrierCode(), shipment.getCarrierName(), shipment.getTrackingNo());
    }

    /**
     * 回寄<b>覆盖更新</b>（C10）：作废旧的回寄包裹后重新记一次——买家改运单号（填错、换快递）重提交，
     * 一单同一时刻至多一张有效 RETURN 包裹，售后卡与物流页从此只见最新一条。
     *
     * <p>为什么是「删除重建」而不是原地改运单号列，也不是给旧包裹打作废标记（logistics 数据模型下三选一）：
     * <ul>
     *   <li>作废标记要新增状态值或列——状态 CHECK 是既有迁移，本任务不开新迁移，路走不通；</li>
     *   <li>原地改号会让<b>旧单号</b>的轨迹节点（按 shipment_id 挂载）继续挂在换过身份的新单号上，
     *       买家看到半条别人家的轨迹；包裹状态还是旧轨迹推上去的投影，单调性不允许倒回"已揽收"重算；</li>
     *   <li>删旧插新则三者都干净：RETURN 包裹没有对外身份引用（轨迹节点随删，售后单只持有自己的投影列，
     *       异常单只扫正向），重建后状态、轨迹、运单号三者同源，运单号唯一索引也不再和买家自己撞车。</li>
     * </ul>
     * 同事务：删与插要么一起成，要么都不动旧包裹。
     */
    @Transactional
    public ReturnShipmentView replace(
            UUID orderId, UUID userId, UUID shopId, String carrierCode, String carrierName, String trackingNo) {
        List<Shipment> previous = shipmentMapper.selectByOrderAndDirection(orderId, ShipmentDirection.RETURN);
        if (!previous.isEmpty()) {
            List<UUID> shipmentIds = previous.stream().map(Shipment::getId).toList();
            trackingNodeMapper.deleteByShipmentIds(shipmentIds);
            shipmentMapper.deleteByIds(shipmentIds);
        }
        return record(orderId, userId, shopId, carrierCode, carrierName, trackingNo);
    }
}
