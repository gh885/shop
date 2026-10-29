import { describe, expect, it } from "vite-plus/test"

import { FEE_TIER_FIELDS } from "./constants"
import { EMPTY_REGION_RULE } from "./form"

describe("FEE_TIER_FIELDS", () => {
    it("覆盖 RegionRuleFormValue 的每一个计费字段，一个不多一个不少", () => {
        expect(new Set(FEE_TIER_FIELDS.map((field) => field.key))).toEqual(
            new Set(Object.keys(EMPTY_REGION_RULE)),
        )
    })
})
