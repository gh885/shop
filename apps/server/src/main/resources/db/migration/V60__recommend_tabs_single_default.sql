-- V60: 推荐词条「全局至多一个默认」落库 —— is_default 唯一此前只是注释口径与 admin 前端协作，
-- 没有 DB 不变式，两个会话各自设默认就会写出双默认行。对齐 addresses（V11）与 shipping_rules（V53）
-- 的先例：部分唯一索引钉死，并发写由应用层（ContentService 经 DuplicateKeys）抓冲突转 409。

-- 先收敛历史脏数据：保留 sort_order 最小的一条默认，其余取消（数据本就干净时 0 行受影响）
UPDATE cms.recommend_tabs
SET is_default = false, updated_at = now()
WHERE is_default
  AND id <> (
      SELECT id
      FROM cms.recommend_tabs
      WHERE is_default
      ORDER BY sort_order, id
      LIMIT 1
  );

-- 全局至多一条默认词条（部分唯一索引只约束 is_default = TRUE 的行，键取 is_default 本身：
-- 谓词内所有行的键值相同，两行默认即撞键。与 V11/V53 的区别仅在无归属列可分桶——默认位是全局唯一的）
CREATE UNIQUE INDEX IF NOT EXISTS uk_recommend_tabs_default ON cms.recommend_tabs (is_default)
    WHERE is_default = TRUE;
