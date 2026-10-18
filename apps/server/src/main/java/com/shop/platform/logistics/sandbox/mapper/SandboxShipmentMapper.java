package com.shop.platform.logistics.sandbox.mapper;

import com.shop.platform.logistics.mapper.Shipment;
import java.time.OffsetDateTime;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 沙箱专用的取数口——<b>刻意不写进 {@code logistics.mapper.ShipmentMapper}</b>。
 *
 * <p>理由是那条"删掉 sandbox 包，业务代码零改动"的验收线：模拟器的查询如果长在业务 mapper 上，
 * 这条线当场就断了（删包得回头改业务文件）。所以沙箱带的取数语句自己带，包一删，全没了。
 *
 * <p>查询条件只有一条语义：<b>刚交寄、还在途</b>。{@code shipped_at} 的下界把历史单挡在外面——
 * 本地库里躺着三天前发的单，不该因为今天打开了模拟器就突然开始长轨迹。
 */
@Mapper
public interface SandboxShipmentMapper {

    /**
     * 在途候选：已发出、且交寄时刻落在 {@code since} 之后（只模拟"最近发出去的这批"）。
     *
     * <p>不按方向过滤：逆向回寄包裹同样是已发出、同样该有条轨迹，模拟器一视同仁。
     */
    @Select(
            """
            SELECT * FROM logistics.shipments
            WHERE status = 'DISPATCHED'
              AND shipped_at IS NOT NULL
              AND shipped_at > #{since}
            ORDER BY shipped_at
            LIMIT #{limit}
            """)
    List<Shipment> selectInFlight(@Param("since") OffsetDateTime since, @Param("limit") int limit);
}
