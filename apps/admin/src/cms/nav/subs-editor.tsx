import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button, Input } from "@shop/ui-web"

import type { SubsGroup, SubsValue } from "./form"

/**
 * subs 两级编辑器：组（NavGroup）有序增删 + 组内词条（string）增删。
 * 受控组件；校验由调用方在提交时过 SubsSchema，错误文案经 error prop 回显。
 */
export function SubsEditor({
    value,
    onChange,
    error,
}: {
    value: SubsValue
    onChange: (next: SubsValue) => void
    error?: string
}) {
    const setGroup = (gi: number, group: SubsGroup) =>
        onChange(value.map((g, i) => (i === gi ? group : g)))

    const moveGroup = (gi: number, delta: -1 | 1) => {
        const to = gi + delta
        const current = value[gi]
        const moved = value[to]
        if (!current || !moved) return
        const next = [...value]
        next[gi] = moved
        next[to] = current
        onChange(next)
    }

    return (
        <div className="flex flex-col gap-3">
            {value.map((group, gi) => (
                <div
                    key={gi}
                    className="rounded-lg border bg-card p-3"
                >
                    <div className="flex items-center gap-2">
                        <Input
                            value={group.name}
                            onChange={(e) => setGroup(gi, { ...group, name: e.target.value })}
                            placeholder={`分组 ${gi + 1} 名称，如「手机数码」`}
                            maxLength={64}
                        />
                        <GroupControls
                            onUp={() => moveGroup(gi, -1)}
                            onDown={() => moveGroup(gi, 1)}
                            upDisabled={gi === 0}
                            downDisabled={gi === value.length - 1}
                            onDelete={() => onChange(value.filter((_, i) => i !== gi))}
                        />
                    </div>
                    {(group.items ?? []).map((item, ii) => (
                        <div
                            key={ii}
                            className="mt-2 flex items-center gap-2 pl-8"
                        >
                            <Input
                                value={item}
                                onChange={(e) => {
                                    const items = [...(group.items ?? [])]
                                    items[ii] = e.target.value
                                    setGroup(gi, { ...group, items })
                                }}
                                placeholder="词条文案"
                                maxLength={64}
                            />
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`删除词条 ${item || ii + 1}`}
                                onClick={() =>
                                    setGroup(gi, {
                                        ...group,
                                        items: group.items?.filter((_, i) => i !== ii),
                                    })
                                }
                            >
                                <Trash2Icon data-slot="icon" />
                            </Button>
                        </div>
                    ))}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 self-start"
                        onClick={() =>
                            setGroup(gi, { ...group, items: [...(group.items ?? []), ""] })
                        }
                    >
                        <PlusIcon data-slot="icon" />
                        添加词条
                    </Button>
                </div>
            ))}
            <div className="flex items-center justify-between">
                <Button
                    variant="outline"
                    size="sm"
                    disabled={value.length >= 30}
                    onClick={() => onChange([...value, { name: "", items: [] }])}
                >
                    <PlusIcon data-slot="icon" />
                    添加分组（{value.length}/30）
                </Button>
                {error && <p className="text-xs text-destructive">{error}</p>}
            </div>
        </div>
    )
}

function GroupControls({
    onUp,
    onDown,
    upDisabled,
    downDisabled,
    onDelete,
}: {
    onUp: () => void
    onDown: () => void
    upDisabled: boolean
    downDisabled: boolean
    onDelete: () => void
}) {
    return (
        <div className="flex shrink-0">
            <Button
                variant="ghost"
                size="icon-sm"
                aria-label="上移分组"
                disabled={upDisabled}
                onClick={onUp}
            >
                <ArrowUpIcon data-slot="icon" />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                aria-label="下移分组"
                disabled={downDisabled}
                onClick={onDown}
            >
                <ArrowDownIcon data-slot="icon" />
            </Button>
            <Button
                variant="ghost"
                size="icon-sm"
                aria-label="删除分组"
                onClick={onDelete}
            >
                <Trash2Icon data-slot="icon" />
            </Button>
        </div>
    )
}
