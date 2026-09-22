-- V64: 账号注销落地（个保法第 47 条）—— 注销拆成「申请」与「生效」两个时刻
--
-- 背景：此前账号只有 ACTIVE/DISABLED 两态且「不做物理删除」（ACC-16），买家没有任何自助退出通道，
-- 平台也没有删除个人信息的入口——法定义务缺位。补法是「匿名化 + 封存身份」，不是删行：
-- 全库十余处裸 user_id 指向 account.users，删掉行会让历史订单、支付、售后单失去主体，
-- 而交易记录本身另有法定留存义务（电商法第 31 条），注销抹的是身份，不是账。
--
--   * deletion_requested_at：冷静期起点。买家提交注销申请的那一刻，期内账号照常可用、可随时撤销；
--     NULL = 没有待生效的申请。期满由定时任务执行（窗口见 AccountDeletionTimeouts）
--   * deleted_at：注销生效时刻。同一笔条件更新里该行个人信息（手机号/密码/昵称/头像）被匿名化，
--     状态一并推进到 DISABLED——既有闸门（下单/领券/入店）一律实时读 status，注销身份自然失去全部资格
--
-- 刻意不给 deleted_at 加 @TableLogic：注销主体要留在原行上被管理端与审核看见（地址簿那种「用户自己
-- 删掉的一条数据」才需要隐身）；何况 account :: api 与本地造数器走的是裸 SQL，逻辑删除拦不住它们，
-- 加了就是两套口径。
ALTER TABLE account.users
    ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN account.users.deletion_requested_at IS '注销申请时刻（冷静期起点，期内可撤销）；NULL = 无待生效申请';
COMMENT ON COLUMN account.users.deleted_at IS '注销生效时刻，同时该行个人信息已匿名化；行保留供历史交易挂靠';

-- 注销即失效：有生效时刻的行不得留在 ACTIVE（匿名化与状态推进是同一笔更新，不存在中间态）。
-- 反向不成立也不由 CHECK 管：DISABLED 未必已注销——平台封号就是这个态（ACC-16）。
ALTER TABLE account.users
    ADD CONSTRAINT ck_users_deletion_state CHECK (deleted_at IS NULL OR status = 'DISABLED');
