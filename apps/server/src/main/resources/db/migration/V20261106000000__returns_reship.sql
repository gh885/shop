SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- 换货重发落地：auto_ship 从没有被任何路径写过（系统不会替商家发货，到期兜底实际是转退款），
-- 换成 auto_complete——补发在途 7 天无人异议自动完成。没有历史数据带 auto_ship，只改注释、不动数据。
COMMENT ON COLUMN returns.after_sale_case.deadline_action IS
    '到期自动做什么：auto_approve / auto_close / auto_refund / auto_complete；扫描器只执行不判断';
