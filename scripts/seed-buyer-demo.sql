-- Local development only. Target: bf8a8a73-b7be-41e3-8117-f65559046d50
-- Run with psql -X -v ON_ERROR_STOP=1 -d shop -f scripts/seed-buyer-demo.sql
-- Additive, atomic, repeat-safe. Never deletes/rebuilds existing buyer data.
-- DEMO-BF8A-* deliberately does not match the startup seeder's DEV* cleanup.
-- Historical business timestamps; inventory ledger records import time, not fake historical stock frames.
-- Pending orders use the real 15-minute payment window and will naturally expire.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '90s';
SELECT pg_advisory_xact_lock(hashtext('buyer-demo-bf8a8a73-v1'));

CREATE FUNCTION pg_temp.demo_stock(sku uuid, oid uuid, movement text, n integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE s inventory.sku_stock%ROWTYPE; ds integer := 0; df integer := 0;
BEGIN
    SELECT * INTO STRICT s FROM inventory.sku_stock WHERE sku_id = sku FOR UPDATE;
    CASE movement
        WHEN 'FREEZE' THEN df := n;
        WHEN 'CAPTURE' THEN ds := -n; df := -n;
        WHEN 'RELEASE' THEN df := -n;
        WHEN 'RETURN' THEN ds := n;
        ELSE RAISE EXCEPTION 'Unsupported movement %', movement;
    END CASE;
    UPDATE inventory.sku_stock SET stock = stock + ds, frozen_stock = frozen_stock + df,
        version = version + 1, updated_at = now() WHERE sku_id = sku;
    INSERT INTO inventory.stock_movements(sku_id, order_id, type, quantity,
        before_stock, after_stock, before_available, after_available)
    VALUES(sku, oid, movement, ds, s.stock, s.stock + ds,
        s.stock - s.frozen_stock, s.stock + ds - s.frozen_stock - df);
END $$;

CREATE FUNCTION pg_temp.demo_log(oid uuid, prev text, target text, act text, actor text, at_time timestamptz, note text DEFAULT NULL)
RETURNS void LANGUAGE sql AS $$
    INSERT INTO orders.order_status_log(order_id, from_status, to_status, action, actor_type, created_at, reason)
    VALUES(oid, prev, target, act, actor, at_time, note);
$$;

CREATE FUNCTION pg_temp.demo_shipment(o orders.orders, state text, suffix text, direction_value text DEFAULT 'FORWARD')
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE sid uuid := uuidv7(); sent timestamptz; ended timestamptz; node text; nodes text[];
    descriptions text[] := ARRAY['演示：包裹已揽收','演示：到达杭州分拨中心','演示：离开分拨中心，发往收件城市','演示：快递员正在派送','演示：包裹已签收'];
    count_nodes integer; k integer; track text := o.order_no || '-' || suffix;
BEGIN
    sent := CASE WHEN direction_value = 'RETURN' THEN now() - interval '20 hours' ELSE o.shipped_at END;
    ended := CASE WHEN state = 'DELIVERED' THEN
        CASE WHEN direction_value = 'RETURN' THEN now() - interval '8 hours' ELSE o.delivered_at END
        ELSE LEAST(sent + interval '20 hours', now() - interval '1 hour') END;
    INSERT INTO logistics.shipments(id, order_id, user_id, shop_id, direction, carrier_name, carrier_code,
        tracking_no, status, shipped_at, delivered_at, created_at, updated_at,
        ship_from_contact_name, ship_from_phone, ship_from_province, ship_from_city, ship_from_district, ship_from_detail)
    VALUES(sid, o.id, o.user_id, o.shop_id, direction_value, '顺丰速运', NULL,
        track, state, sent, CASE WHEN state = 'DELIVERED' THEN ended END, sent, COALESCE(ended,sent),
        '演示发货员', '13800000000', '浙江省', '杭州市', '余杭区', '演示仓库 1 号（虚构地址）');
    -- No carrier code: synthetic waybills must not be queried against a real carrier.
    nodes := ARRAY['PICKED_UP','ARRIVED_HUB','DEPARTED_HUB','OUT_FOR_DELIVERY','DELIVERED'];
    count_nodes := CASE state WHEN 'PENDING_PICKUP' THEN 0 WHEN 'PICKED_UP' THEN 1
        WHEN 'IN_TRANSIT' THEN 3 WHEN 'DELIVERING' THEN 4 WHEN 'DELIVERED' THEN 5 ELSE 3 END;
    FOR k IN 1..count_nodes LOOP
        node := nodes[k];
        INSERT INTO logistics.tracking_nodes(shipment_id,node_code,description,location,occurred_at,dedupe_key)
        VALUES(sid,node,descriptions[k],CASE WHEN k < 4 THEN '杭州分拨中心' ELSE o.receiver_city END,
            sent + (ended-sent)*k/count_nodes, sid::text || ':' || k);
    END LOOP;
    IF state = 'EXCEPTION' THEN
        INSERT INTO logistics.tracking_nodes(shipment_id,node_code,description,location,occurred_at,dedupe_key)
        VALUES(sid,'EXCEPTION','演示：外包装破损，已联系商家核实',o.receiver_city,ended + interval '10 minutes',sid::text || ':exception');
    END IF;
    RETURN sid;
END $$;

DO $$
DECLARE
    uid constant uuid := 'bf8a8a73-b7be-41e3-8117-f65559046d50';
    r record; line record; p record; a account.addresses%ROWTYPE; o orders.orders%ROWTYPE;
    oid uuid; tid uuid; cid uuid; tpl uuid; sid uuid; shopid uuid; skuids uuid[];
    i integer; j integer; n integer; total bigint; discount bigint; created timestamptz;
    paid timestamptz; shipped timestamptz; delivered timestamptz; completed timestamptz;
    cancelled timestamptz; refund_time timestamptz; ticket_time timestamptz; coupon_time timestamptz;
    has_paid boolean; no text; template_name text; threshold bigint; face bigint;
    effective timestamptz; expires timestamptz; coupon_status text; available integer;
BEGIN
    IF current_database() <> 'shop' OR current_user <> 'shop' THEN
        RAISE EXCEPTION 'This script is restricted to the local shop development database and role';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM account.users WHERE id=uid AND status='ACTIVE') THEN
        RAISE EXCEPTION 'Active target user not found';
    END IF;
    IF EXISTS(SELECT 1 FROM orders.orders WHERE order_no LIKE 'DEMO-BF8A-%') THEN
        RAISE NOTICE 'Demo batch already exists; nothing changed (including inventory).';
        RETURN;
    END IF;

    -- Stage owning-schema reads separately: no cross-schema JOINs.
    CREATE TEMP TABLE demo_shops ON COMMIT DROP AS SELECT * FROM shop.shops
        WHERE status='ACTIVE' AND id::text LIKE '01900000-0000-7000-8000-0000000008d%';
    CREATE TEMP TABLE demo_products ON COMMIT DROP AS SELECT * FROM product.products
        WHERE shop_id IN (SELECT id FROM demo_shops) AND status IN ('PUBLISHED','WAREHOUSE');
    CREATE TEMP TABLE demo_skus ON COMMIT DROP AS
        SELECT s.*, dp.shop_id, dp.main_image, dp.status AS product_status
        FROM product.skus s JOIN demo_products dp ON dp.id=s.product_id
        WHERE s.price IS NOT NULL AND s.currency='CNY';
    IF (SELECT count(*) FROM demo_shops) <> 5 THEN RAISE EXCEPTION 'Expected five demo shops'; END IF;

    -- Six labels, six valid districts; preserve an existing default if any.
    FOR r IN SELECT * FROM (VALUES
        (1,'林小满','HOME','330106','浙江省','杭州市','西湖区','文三路演示小区 1 幢 602 室'),
        (2,'林小满','WORK','330110','浙江省','杭州市','余杭区','文一西路演示科技园 A 座 1208 室，工作日配送'),
        (3,'林同学','SCHOOL','110108','北京市','北京市','海淀区','学院路演示校园南门收发室'),
        (4,'林阿姨','PARENTS','510107','四川省','成都市','武侯区','锦绣路演示花园 3 栋 201 室'),
        (5,'陈小夏','FRIEND','440305','广东省','深圳市','南山区','科技南路演示公寓 2 栋 1801 室'),
        (6,'林小满','周末住处','310115','上海市','上海市','浦东新区','张江路演示社区 8 号楼 1102 室，门口请电话联系')
    ) AS v(idx,name,label,code,province,city,district,detail) LOOP
        INSERT INTO account.addresses(user_id,receiver_name,phone,region_code,province,city,district,detail,label,is_default,created_at)
        VALUES(uid,r.name,'13800000000',r.code,r.province,r.city,r.district,r.detail || '（虚构地址）',r.label,
            r.idx=1 AND NOT EXISTS(SELECT 1 FROM account.addresses WHERE user_id=uid AND is_default AND deleted_at IS NULL),
            now()-r.idx*interval '1 day');
    END LOOP;
    INSERT INTO favorite.items(user_id,product_id,created_at)
    SELECT uid,id,now()-row_number() OVER(ORDER BY id)*interval '9 hours' FROM demo_products
    ON CONFLICT(user_id,product_id) DO NOTHING;

    -- One SKU per selected SPU, multiple shops, selected/unselected, quantities, off-shelf and insufficient stock.
    i := 0;
    FOR p IN SELECT * FROM demo_products ORDER BY id LOOP
        i := i+1;
        IF i%2=0 OR p.status='WAREHOUSE' THEN
            SELECT * INTO STRICT line FROM demo_skus WHERE product_id=p.id ORDER BY id LIMIT 1;
            SELECT stock-frozen_stock INTO STRICT available FROM inventory.sku_stock WHERE sku_id=line.id;
            n := CASE WHEN i=2 THEN LEAST(999,available+1) ELSE 1+i%3 END;
            IF i=2 AND available>=999 THEN RAISE EXCEPTION 'Cannot demonstrate insufficient stock without modifying catalog'; END IF;
            INSERT INTO cart.items(user_id,sku_id,quantity,selected,created_at)
            VALUES(uid,line.id,n,i%3<>0 AND p.status='PUBLISHED',now()-i*interval '30 minutes')
            ON CONFLICT(user_id,sku_id) DO NOTHING;
        END IF;
    END LOOP;

    -- 28 order scenarios, all five fulfillment states and all aftersale states.
    FOR r IN SELECT * FROM (VALUES
        (1,1,'PENDING_PAYMENT','NONE',NULL,'待付款：普通单',NULL),
        (2,2,'PENDING_PAYMENT','NONE',NULL,'待付款：优惠券占用',NULL),
        (3,3,'PENDING_PAYMENT','NONE',NULL,'待付款：多件食品',NULL),
        (4,4,'PAID','NONE',NULL,'待发货：大件家居',NULL),
        (5,5,'PAID','NONE',NULL,'待发货：优惠券已核销',NULL),
        (6,1,'PAID','NONE',NULL,'待发货：多商品合单',NULL),
        (7,2,'SHIPPED','NONE',NULL,'待揽收','PENDING_PICKUP'),
        (8,3,'SHIPPED','NONE',NULL,'运输中','IN_TRANSIT'),
        (9,4,'SHIPPED','NONE',NULL,'派送中','DELIVERING'),
        (10,5,'SHIPPED','NONE',NULL,'已签收：待确认收货','DELIVERED'),
        (11,1,'SHIPPED','NONE',NULL,'物流异常：包装破损','EXCEPTION'),
        (12,2,'SHIPPED','NONE',NULL,'同一订单两个包裹','IN_TRANSIT'),
        (13,3,'COMPLETED','NONE',NULL,'已完成：可申请售后','DELIVERED'),
        (14,4,'COMPLETED','NONE',NULL,'已完成：售后窗口已过','DELIVERED'),
        (15,5,'COMPLETED','APPLYING','REFUND_ONLY','仅退款：待商家处理','DELIVERED'),
        (16,1,'COMPLETED','APPLYING','RETURN_REFUND','退货退款：待商家处理','DELIVERED'),
        (17,2,'COMPLETED','RETURNING','RETURN_REFUND','商家同意：待买家寄回','DELIVERED'),
        (18,3,'COMPLETED','RETURNING','RETURN_REFUND','退货已寄出：运输中','DELIVERED'),
        (19,4,'COMPLETED','REFUNDED','REFUND_ONLY','仅退款完成：原券保留、新券补发','DELIVERED'),
        (20,5,'COMPLETED','REFUNDED','RETURN_REFUND','退货退款完成：已回补库存','DELIVERED'),
        (21,1,'COMPLETED','REJECTED','REFUND_ONLY','售后被拒：允许再次申请','DELIVERED'),
        (22,2,'COMPLETED','CLOSED','RETURN_REFUND','买家主动撤销售后','DELIVERED'),
        (23,3,'CANCELLED','NONE',NULL,'买家取消：未支付',NULL),
        (24,4,'CANCELLED','NONE',NULL,'超时未支付：自动关闭',NULL),
        (25,5,'CANCELLED','NONE',NULL,'付款后取消：已退款',NULL),
        (26,1,'CANCELLED','NONE',NULL,'超时未发货：自动退款',NULL),
        (27,2,'COMPLETED','APPLYING','RETURN_REFUND','首次被拒后：重新申请','DELIVERED'),
        (28,3,'COMPLETED','NONE',NULL,'系统自动确认收货','DELIVERED')
    ) AS v(idx,shop_idx,status,after_status,ticket_type,scenario,shipment_status) ORDER BY idx LOOP
        SELECT id INTO STRICT shopid FROM demo_shops ORDER BY id OFFSET (r.shop_idx-1) LIMIT 1;
        SELECT * INTO STRICT a FROM account.addresses WHERE user_id=uid AND deleted_at IS NULL
            ORDER BY created_at,id OFFSET ((r.idx-1)%6) LIMIT 1;
        SELECT array_agg(id ORDER BY id) INTO skuids FROM (
            SELECT DISTINCT ON(product_id) id,product_id FROM demo_skus
            WHERE shop_id=shopid AND product_status='PUBLISHED' AND status='ON_SALE'
            ORDER BY product_id,id
        ) q;
        n := LEAST(1+r.idx%3,array_length(skuids,1));
        total := 0;
        FOR j IN 1..n LOOP
            SELECT * INTO STRICT line FROM demo_skus WHERE id=skuids[j];
            total := total+line.price*(1+(r.idx+j)%2);
        END LOOP;
        oid := uuidv7(); no := 'DEMO-BF8A-' || lpad(r.idx::text,3,'0');
        has_paid := r.status NOT IN ('PENDING_PAYMENT','CANCELLED') OR r.idx IN (25,26);
        created := CASE r.status WHEN 'PENDING_PAYMENT' THEN now()
            WHEN 'PAID' THEN now()-interval '6 hours'
            WHEN 'SHIPPED' THEN now()-interval '2 days'
            WHEN 'COMPLETED' THEN now()-interval '7 days'
            ELSE now()-interval '5 days' END;
        IF r.idx IN (14,28) THEN created:=now()-interval '40 days'; END IF;
        paid := CASE WHEN has_paid THEN created+interval '2 minutes' END;
        shipped := CASE WHEN r.status IN ('SHIPPED','COMPLETED') THEN created+interval '12 hours' END;
        delivered := CASE WHEN r.shipment_status='DELIVERED' THEN shipped+interval '1 day' END;
        completed := CASE WHEN r.status='COMPLETED' THEN delivered+interval '1 hour' END;
        IF r.idx=28 THEN completed:=delivered+interval '7 days'; END IF;
        cancelled := CASE WHEN r.idx=24 THEN created+interval '15 minutes'
            WHEN r.idx=26 THEN paid+interval '3 days'
            WHEN r.status='CANCELLED' THEN created+interval '8 minutes' END;
        refund_time := CASE WHEN r.after_status='REFUNDED' THEN now()-interval '6 hours'
            WHEN r.idx IN (25,26) THEN cancelled END;
        discount := 0; cid := NULL;

        IF r.idx IN (2,5,19) THEN
            tpl:=uuidv7(); cid:=uuidv7(); discount:=LEAST(2000,total);
            INSERT INTO coupon.coupon_templates(id,shop_id,name,threshold_amount,discount_amount,valid_from,valid_to,total_quantity,issued_quantity,created_at)
            VALUES(tpl,shopid,'演示·订单专享满减券 '||r.idx,0,2000,created-interval '1 day',now()+interval '30 days',1,1,created-interval '1 day');
            INSERT INTO coupon.user_coupons(id,template_id,user_id,shop_id,name,threshold_amount,discount_amount,
                effective_at,expire_at,status,order_id,locked_at,used_at,applied_discount_amount,created_at)
            VALUES(cid,tpl,uid,shopid,'演示·订单专享满减券 '||r.idx,0,2000,created-interval '1 day',now()+interval '30 days',
                CASE WHEN has_paid THEN 'USED' ELSE 'LOCKED' END,oid,created,paid,discount,created-interval '1 hour');
            INSERT INTO coupon.coupon_usages(user_coupon_id,order_id,user_id,shop_id,action,discount_amount,created_at)
            VALUES(cid,oid,uid,shopid,'LOCK',discount,created);
            IF has_paid THEN
                INSERT INTO coupon.coupon_usages(user_coupon_id,order_id,user_id,shop_id,action,discount_amount,created_at)
                VALUES(cid,oid,uid,shopid,'USE',discount,paid);
            END IF;
            IF r.idx=19 THEN
                INSERT INTO coupon.user_coupons(template_id,user_id,shop_id,name,threshold_amount,discount_amount,effective_at,expire_at,source,created_at)
                VALUES(tpl,uid,shopid,'演示·订单专享满减券 '||r.idx,0,2000,refund_time,now()+interval '30 days','REFUND_RETURN',refund_time);
                INSERT INTO coupon.coupon_usages(user_coupon_id,order_id,user_id,shop_id,action,discount_amount,created_at)
                VALUES(cid,oid,uid,shopid,'RETURN',discount,refund_time);
            END IF;
        END IF;

        INSERT INTO orders.orders(id,order_no,user_id,shop_id,status,item_amount,shipping_fee,pay_amount,
            discount_amount,user_coupon_id,coupon_bearer,receiver_name,receiver_phone,receiver_province,receiver_city,
            receiver_district,receiver_detail,receiver_region_code,buyer_message,paid_at,shipped_at,delivered_at,
            completed_at,cancelled_at,cancel_reason,pay_expire_at,ship_expire_at,receive_expire_at,apply_expire_at,
            after_sale_status,refund_amount,created_at,updated_at,checkout_key)
        VALUES(oid,no,uid,shopid,r.status,total,0,total-discount,discount,cid,CASE WHEN cid IS NOT NULL THEN 'SELLER' END,
            a.receiver_name,a.phone,a.province,a.city,a.district,a.detail,a.region_code,'[演示] '||r.scenario,
            paid,shipped,delivered,completed,cancelled,
            CASE WHEN r.status='CANCELLED' THEN r.scenario END,created+interval '15 minutes',paid+interval '3 days',
            COALESCE(delivered,shipped)+interval '7 days',completed+interval '15 days',r.after_status,
            CASE WHEN r.after_status='REFUNDED' THEN total-discount END,created,
            COALESCE(refund_time,cancelled,completed,delivered,shipped,paid,created),uuidv7());
        PERFORM pg_temp.demo_log(oid,NULL,'PENDING_PAYMENT','CREATE','BUYER',created);
        IF has_paid THEN
            PERFORM pg_temp.demo_log(oid,'PENDING_PAYMENT','PAID','PAY','BUYER',paid);
            INSERT INTO payment.payments(order_id,order_no,user_id,amount,status,paid_at,refunded_at,refund_gateway_no,created_at)
            VALUES(oid,no,uid,total-discount,CASE WHEN refund_time IS NULL THEN 'SUCCESS' ELSE 'REFUNDED' END,
                paid,refund_time,CASE WHEN refund_time IS NOT NULL THEN 'MOCK-REFUND-'||no END,paid);
        END IF;
        IF shipped IS NOT NULL THEN PERFORM pg_temp.demo_log(oid,'PAID','SHIPPED','SHIP','SELLER',shipped); END IF;
        IF completed IS NOT NULL THEN
            PERFORM pg_temp.demo_log(oid,'SHIPPED','COMPLETED',CASE WHEN r.idx=28 THEN 'AUTO_RECEIVE' ELSE 'RECEIVE' END,
                CASE WHEN r.idx=28 THEN 'SYSTEM' ELSE 'BUYER' END,completed);
        END IF;
        IF cancelled IS NOT NULL THEN
            PERFORM pg_temp.demo_log(oid,CASE WHEN has_paid THEN 'PAID' ELSE 'PENDING_PAYMENT' END,'CANCELLED',
                CASE WHEN r.idx IN (24,26) THEN 'AUTO_CANCEL' ELSE 'CANCEL' END,
                CASE WHEN r.idx IN (24,26) THEN 'SYSTEM' ELSE 'BUYER' END,cancelled,r.scenario);
        END IF;

        FOR j IN 1..n LOOP
            SELECT * INTO STRICT line FROM demo_skus WHERE id=skuids[j];
            i := 1+(r.idx+j)%2;
            INSERT INTO orders.items(order_id,product_id,sku_id,name,image,price,original_price,currency,quantity,amount,created_at)
            VALUES(oid,line.product_id,line.id,line.name,COALESCE(line.image,line.main_image),line.price,line.original_price,'CNY',i,line.price*i,created);
            PERFORM pg_temp.demo_stock(line.id,oid,'FREEZE',i);
            IF has_paid THEN PERFORM pg_temp.demo_stock(line.id,oid,'CAPTURE',i); END IF;
            IF r.status='CANCELLED' THEN
                PERFORM pg_temp.demo_stock(line.id,oid,CASE WHEN has_paid THEN 'RETURN' ELSE 'RELEASE' END,i);
            END IF;
            IF r.idx=20 THEN PERFORM pg_temp.demo_stock(line.id,oid,'RETURN',i); END IF;
            IF r.status='COMPLETED' THEN
                UPDATE product.products SET sold_count=sold_count+i WHERE id=line.product_id;
            END IF;
        END LOOP;
        SELECT * INTO STRICT o FROM orders.orders WHERE id=oid;
        IF shipped IS NOT NULL THEN
            sid:=pg_temp.demo_shipment(o,r.shipment_status,'F1');
            IF r.idx=12 THEN sid:=pg_temp.demo_shipment(o,'PICKED_UP','F2'); END IF;
            UPDATE orders.orders SET logistics_company='顺丰速运',
                tracking_no=no||CASE WHEN r.idx=12 THEN '-F2' ELSE '-F1' END WHERE id=oid;
        END IF;

        IF r.after_status<>'NONE' THEN
            tid:=uuidv7(); ticket_time:=completed+interval '1 day';
            IF r.idx=27 THEN
                INSERT INTO aftersale.tickets(id,order_id,user_id,shop_id,type,status,reason,refund_amount,created_at,updated_at)
                VALUES(tid,oid,uid,shopid,'REFUND_ONLY','REJECTED','演示：首次申请缺少问题说明',total-discount,ticket_time,ticket_time+interval '1 hour');
                INSERT INTO aftersale.ticket_events(ticket_id,actor,action,note,created_at) VALUES
                    (tid,'BUYER','APPLY','首次申请退款',ticket_time),
                    (tid,'SELLER','REJECT','请补充问题说明后重新申请',ticket_time+interval '1 hour');
                tid:=uuidv7(); ticket_time:=ticket_time+interval '1 day';
            END IF;
            INSERT INTO aftersale.tickets(id,order_id,user_id,shop_id,type,status,reason,refund_amount,refunded_at,created_at,updated_at,
                return_logistics_company,return_tracking_no)
            VALUES(tid,oid,uid,shopid,r.ticket_type,r.after_status,'[演示] '||r.scenario,total-discount,
                CASE WHEN r.after_status='REFUNDED' THEN refund_time END,ticket_time,
                COALESCE(refund_time,ticket_time+interval '1 hour'),
                CASE WHEN r.idx IN (18,20) THEN '顺丰速运' END,CASE WHEN r.idx IN (18,20) THEN no||'-R1' END);
            INSERT INTO aftersale.ticket_events(ticket_id,actor,action,note,created_at)
            VALUES(tid,'BUYER','APPLY','[演示] '||r.scenario,ticket_time);
            IF r.after_status IN ('RETURNING','REFUNDED') AND r.ticket_type='RETURN_REFUND' THEN
                INSERT INTO aftersale.ticket_events(ticket_id,actor,action,note,created_at)
                VALUES(tid,'SELLER','AGREE_RETURN','同意退货，请按退货地址寄回',ticket_time+interval '1 hour');
            END IF;
            IF r.idx IN (18,20) THEN
                sid:=pg_temp.demo_shipment(o,CASE WHEN r.idx=20 THEN 'DELIVERED' ELSE 'IN_TRANSIT' END,'R1','RETURN');
                INSERT INTO aftersale.ticket_events(ticket_id,actor,action,note,created_at)
                VALUES(tid,'BUYER','RETURN_GOODS','顺丰速运 '||no||'-R1',now()-interval '20 hours');
            END IF;
            IF r.after_status IN ('REFUNDED','REJECTED','CLOSED') THEN
                INSERT INTO aftersale.ticket_events(ticket_id,actor,action,note,created_at)
                VALUES(tid,CASE WHEN r.after_status='CLOSED' THEN 'BUYER' ELSE 'SELLER' END,
                    CASE r.after_status WHEN 'REJECTED' THEN 'REJECT' WHEN 'CLOSED' THEN 'CLOSE'
                        ELSE CASE WHEN r.ticket_type='RETURN_REFUND' THEN 'RECEIVE_RETURN' ELSE 'REFUND' END END,
                    CASE r.after_status WHEN 'REJECTED' THEN '演示：请补充问题说明后重新申请'
                        WHEN 'CLOSED' THEN '演示：与商家协商后主动撤销' ELSE '演示：退款已原路退回' END,
                    COALESCE(refund_time,ticket_time+interval '1 hour'));
            END IF;
        END IF;
    END LOOP;

    -- Wallet coverage: free-threshold, threshold not met, future, expiring, expired, void, stopped template snapshot.
    FOR i IN 1..12 LOOP
        SELECT id INTO STRICT shopid FROM demo_shops ORDER BY id OFFSET ((i-1)%5) LIMIT 1;
        tpl:=uuidv7(); threshold:=CASE WHEN i%3=0 THEN 0 WHEN i=7 THEN 999900 ELSE 9900 END;
        face:=CASE WHEN i%3=0 THEN 500 ELSE 1500 END;
        effective:=now()-interval '10 days'; expires:=now()+interval '30 days'; coupon_status:='UNUSED';
        template_name:=CASE i WHEN 1 THEN '全店满99减15' WHEN 2 THEN '即将到期满减券'
            WHEN 3 THEN '无门槛减5元' WHEN 4 THEN '明日生效预热券' WHEN 5 THEN '已过期活动券'
            WHEN 6 THEN '已作废体验券' WHEN 7 THEN '满9999大额门槛券' WHEN 8 THEN '领取后模板停发，原券仍有效'
            WHEN 9 THEN '美好生活无门槛券' WHEN 10 THEN '下周生效预售券'
            WHEN 11 THEN '历史过期券' ELSE '周末无门槛券' END;
        IF i=2 THEN expires:=now()+interval '6 hours'; END IF;
        IF i IN (4,10) THEN effective:=now()+CASE WHEN i=4 THEN interval '1 day' ELSE interval '7 days' END; END IF;
        IF i IN (5,11) THEN expires:=now()-interval '1 day'; coupon_status:='EXPIRED'; END IF;
        IF i=6 THEN coupon_status:='VOID'; END IF;
        coupon_time:=LEAST(effective,now())-interval '1 hour';
        INSERT INTO coupon.coupon_templates(id,shop_id,name,threshold_amount,discount_amount,valid_from,valid_to,total_quantity,issued_quantity,status,created_at)
        VALUES(tpl,shopid,'演示·'||template_name,threshold,face,effective,expires,1,1,
            CASE WHEN i IN (6,8) THEN 'STOPPED' ELSE 'ACTIVE' END,coupon_time);
        INSERT INTO coupon.user_coupons(template_id,user_id,shop_id,name,threshold_amount,discount_amount,effective_at,expire_at,status,created_at)
        VALUES(tpl,uid,shopid,'演示·'||template_name,threshold,face,effective,expires,coupon_status,coupon_time);
    END LOOP;
    RAISE NOTICE 'Seeded 28 orders, 6 addresses, favorites/cart, 16 coupons, payments, stock ledger, shipments and aftersale timelines.';
END $$;

-- Transaction-level assertions. An exception rolls back the entire batch, including stock/sales changes.
DO $$
DECLARE o orders.orders%ROWTYPE; total bigint; p payment.payments%ROWTYPE; c coupon.user_coupons%ROWTYPE;
BEGIN
    IF (SELECT count(*) FROM orders.orders WHERE order_no LIKE 'DEMO-BF8A-%')<>28 THEN
        RAISE EXCEPTION 'Expected 28 demo orders';
    END IF;
    FOR o IN SELECT * FROM orders.orders WHERE order_no LIKE 'DEMO-BF8A-%' LOOP
        SELECT sum(amount) INTO total FROM orders.items WHERE order_id=o.id;
        IF total IS DISTINCT FROM o.item_amount THEN RAISE EXCEPTION 'Line total mismatch: %',o.order_no; END IF;
        IF o.paid_at IS NOT NULL THEN
            SELECT * INTO STRICT p FROM payment.payments WHERE order_id=o.id;
            IF p.amount<>o.pay_amount THEN RAISE EXCEPTION 'Payment mismatch: %',o.order_no; END IF;
        END IF;
        IF o.user_coupon_id IS NOT NULL THEN
            SELECT * INTO STRICT c FROM coupon.user_coupons WHERE id=o.user_coupon_id;
            IF c.applied_discount_amount<>o.discount_amount OR c.order_id<>o.id THEN
                RAISE EXCEPTION 'Coupon mismatch: %',o.order_no;
            END IF;
        END IF;
        IF o.shipped_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM logistics.shipments WHERE order_id=o.id AND direction='FORWARD') THEN
            RAISE EXCEPTION 'Missing shipment: %',o.order_no;
        END IF;
        IF o.after_sale_status<>'NONE' AND NOT EXISTS(SELECT 1 FROM aftersale.tickets WHERE order_id=o.id AND status=o.after_sale_status) THEN
            RAISE EXCEPTION 'Missing aftersale: %',o.order_no;
        END IF;
    END LOOP;
END $$;
COMMIT;

SELECT status,after_sale_status,count(*) FROM orders.orders WHERE order_no LIKE 'DEMO-BF8A-%' GROUP BY 1,2 ORDER BY 1,2;
SELECT 'addresses' AS kind,count(*) FROM account.addresses WHERE user_id='bf8a8a73-b7be-41e3-8117-f65559046d50' AND deleted_at IS NULL
UNION ALL SELECT 'favorites',count(*) FROM favorite.items WHERE user_id='bf8a8a73-b7be-41e3-8117-f65559046d50'
UNION ALL SELECT 'cart',count(*) FROM cart.items WHERE user_id='bf8a8a73-b7be-41e3-8117-f65559046d50'
UNION ALL SELECT 'coupons',count(*) FROM coupon.user_coupons WHERE user_id='bf8a8a73-b7be-41e3-8117-f65559046d50'
UNION ALL SELECT 'payments',count(*) FROM payment.payments WHERE user_id='bf8a8a73-b7be-41e3-8117-f65559046d50'
UNION ALL SELECT 'aftersale',count(*) FROM aftersale.tickets WHERE user_id='bf8a8a73-b7be-41e3-8117-f65559046d50'
UNION ALL SELECT 'shipments',count(*) FROM logistics.shipments WHERE user_id='bf8a8a73-b7be-41e3-8117-f65559046d50';
