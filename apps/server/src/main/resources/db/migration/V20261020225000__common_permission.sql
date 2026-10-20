SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 全局权限点清单。三端（买家 / 卖家 / 平台）共用同一份，所以它不属于任何单个模块，住 common。
--
-- 清单驱动的理由和审计动作一样：能做什么由数据库里这张表说了算，代码里只能引用 Permission 枚举，
-- 启动时两边做双向比对，少一个多一个都直接启动失败。
CREATE TABLE common.permission
(
    code        text PRIMARY KEY,
    description text NOT NULL
);

COMMENT ON TABLE common.permission IS '全局权限点清单；与 com.shop.platform.common.security.Permission 枚举双向比对';

INSERT INTO common.permission (code, description) VALUES
    ('order:read',         '查看订单'),
    ('order:refund',       '发起退款'),
    ('product:read',       '查看商品'),
    ('product:write',      '编辑商品'),
    ('shop:read',          '查看店铺经营数据'),
    ('staff:manage',       '管理子账号与角色'),
    ('finance:read',       '查看资金流水'),
    ('settlement:approve', '审批结算单');
