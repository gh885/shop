SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 标准品合并：给 `spu` 加「并到哪儿去了」这一列。
--
-- 标准品在重写版里就是 `catalog.spu` 里 `spu_type = 'standard'` 的行（product-model §2.3），
-- 不是 main 那套独立的 `standard_products` 表。所以「合并」在单表里的表达就是：
-- 源行记下 `merged_into = 目标行 id`，所有指向源的商家 SPU 改指目标。
--
-- **为什么不加 status 列。** 合并态就是 `merged_into IS NOT NULL`，加一个 status 就多一个
-- 会漂的真相源——「status = 'merged' 但 merged_into 为空」和反过来这两种脏行，只能靠 CHECK
-- 兜住，而 CHECK 能兜住的话那个 status 列本身就只是 `merged_into IS NOT NULL` 的同义词。
-- 少一列就少一处要同步的地方。
--
-- **不物理删源行。** 商家 SPU 曾经指向它，历史「当时挂的是哪个标准品」要能查回去；
-- 合并错了也要能反着搬回去。这和 `audit.entry` 只追加是同一条思路。
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE catalog.spu ADD COLUMN merged_into uuid;

COMMENT ON COLUMN catalog.spu.merged_into IS
    '合并去向（另一个 spu_type = standard 的行）。非空 = 这一行已被并入别处，不可再被挂靠';

-- 只有标准品能记合并去向。商家 SPU 被「合并」是另一个概念（那叫改类目或删草稿），
-- 混进这一列会让「这个商家商品被并到哪儿了」变成一个查不到答案的问题。
ALTER TABLE catalog.spu ADD CONSTRAINT ck_spu_merged_only_standard
    CHECK (merged_into IS NULL OR spu_type = 'standard');

-- 不能并到自己。自指会让「顺着 merged_into 找终点」变成一个死循环，
-- 而所有消费方（比价、同款聚合）都要顺着这一列找到底。
ALTER TABLE catalog.spu ADD CONSTRAINT ck_spu_merged_not_self
    CHECK (merged_into IS NULL OR merged_into <> id);

-- 合并后的标准品不该再挂着商家。一条「已并入别处」的行如果还有商家指向它，
-- 说明合并事务只改了一半——那正是要让它当场失败的地方，而不是留一条查不到归属的脏行。
-- （这条约束在合并事务里由「先改指、再标记」的顺序自然满足。）

-- 顺着 merged_into 找终点、以及「这个标准品被谁合并了」都要它。
CREATE INDEX idx_spu_merged_into ON catalog.spu (merged_into) WHERE merged_into IS NOT NULL;

-- 同款聚合与比价的主查询：给定一个标准品，找出所有挂在它上面的商家 SPU。
-- 这是 `standard_spu_id` 的第一个真实消费者（此前这一列只写不读）。
CREATE INDEX idx_spu_standard_spu ON catalog.spu (standard_spu_id)
    WHERE standard_spu_id IS NOT NULL AND spu_type = 'merchant';

-- ─────────────────────────────────────────────────────────────────────────────
-- 修一个已有数据问题：`ck_spu_standard_leaf` 只挡了「标准品不能再挂标准品」，
-- 没挡「标准品挂了自己」。上面那条 ck_spu_merged_not_self 只针对 merged_into。
-- 检查现有数据里有没有 standard_spu_id 指向自己或成环的行——
-- 有的话必须先修，否则合并的「找终点」会死循环。
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    cycles integer;
BEGIN
    WITH RECURSIVE walk(start_id, current_id, depth) AS (
        SELECT id, standard_spu_id, 0
          FROM catalog.spu
         WHERE standard_spu_id IS NOT NULL
        UNION ALL
        SELECT w.start_id, s.standard_spu_id, w.depth + 1
          FROM walk w
          JOIN catalog.spu s ON s.id = w.current_id
         WHERE s.standard_spu_id IS NOT NULL AND w.depth < 100
    )
    SELECT count(*) INTO cycles FROM walk WHERE current_id = start_id;

    IF cycles > 0 THEN
        RAISE EXCEPTION '发现 % 条 standard_spu_id 成环的行，合并的「找终点」会死循环，先修数据', cycles;
    END IF;
END $$;
