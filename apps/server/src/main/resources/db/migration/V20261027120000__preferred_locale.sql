SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 三套身份域各加一列语言偏好。
--
-- 不共用一张表（同 access-control.md §1）：买家、卖家操作账号、平台员工是三个独立的主体，
-- 语言偏好跟着主体走。三列同名同型，因为它们是同一个概念——「这个人希望看到哪种语言」。
--
-- 为什么存 text 不存 enum：词表住 contracts/i18n.config.yaml，那是前端与后端共读的唯一真源
-- （SupportedLocales 运行时读它）。在库里再钉一份枚举，加一个语言要改两处，而两处一定会漂。
-- 校验放在写入路径（SupportedLocales.SUPPORTED），库只保证「非空串或 NULL」。
--
-- NULL 的含义是「没表过态」，不是「用默认语言」——两者在解析时都落到 defaultLocale，
-- 但 NULL 让「用户主动选过默认语言」和「从没选过」可以区分开，将来要按它做引导时不用改表。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE account.buyer ADD COLUMN preferred_locale text;
ALTER TABLE seller.operator ADD COLUMN preferred_locale text;
ALTER TABLE staff.member ADD COLUMN preferred_locale text;

COMMENT ON COLUMN account.buyer.preferred_locale IS '买家语言偏好（BCP 47 标签，取值见 contracts/i18n.config.yaml）；NULL = 没表过态';
COMMENT ON COLUMN seller.operator.preferred_locale IS '卖家操作账号语言偏好；NULL = 没表过态';
COMMENT ON COLUMN staff.member.preferred_locale IS '平台员工语言偏好；NULL = 没表过态';
