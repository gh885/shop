#!/usr/bin/env bash
# 契约漂移检查（lefthook pre-push，见 lefthook.yml）：
#   1) 离线部分：用已提交的 openapi/api-docs.json 重新生成 SDK（含 zod 校验 schema），
#      与提交的生成物比对 —— 保证 src/sdk 与契约文件同步；
#   2) 在线部分：若本地后端在跑，再比对运行中后端的 /v3/api-docs 与提交的契约文件 ——
#      保证契约文件本身没有落后于代码。后端没起就跳过，不阻塞推送。
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0

# ---- 1) SDK 生成物 vs 提交的 api-docs.json（离线）----
(cd packages/api && npx @hey-api/openapi-ts >/dev/null)
if [ -n "$(git diff --name-only -- packages/api/src/sdk)" ]; then
    echo "✖ packages/api/src/sdk 与 openapi/api-docs.json 不同步（生成物有差异，已留在工作区）"
    echo "  → 检查后 git add packages/api/src/sdk 一起提交，再推送"
    fail=1
else
    echo "✓ SDK 生成物与 api-docs.json 同步"
fi

# ---- 2) 提交的 api-docs.json vs 运行中的后端（在线，可选）----
if curl -sf -m 2 http://localhost:8080/v3/api-docs -o /tmp/shop-api-docs-live.json 2>/dev/null; then
    live=$(node -e "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync('/tmp/shop-api-docs-live.json','utf8'))))")
    local_doc=$(node -e "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync('openapi/api-docs.json','utf8'))))")
    if [ "$live" != "$local_doc" ]; then
        echo "✖ 运行中的后端契约与 openapi/api-docs.json 不一致 → 先 pnpm gen:sdk 更新并提交"
        fail=1
    else
        echo "✓ api-docs.json 与运行中的后端一致"
    fi
else
    echo "○ 后端未启动（localhost:8080），跳过在线契约比对"
fi

exit $fail
