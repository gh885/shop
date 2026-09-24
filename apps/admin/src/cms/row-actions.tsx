import { useState, type ComponentType } from "react"
import type { CmsStatus } from "@shop/api/sdk"

import { Button, confirm, Spinner } from "@shop/ui-web"
import { PencilIcon } from "lucide-react"

/** 新增 / 编辑对话框的统一外壳契约：三张 CMS 表单都是这三个 props（新增时不传 editing） */
export interface CmsFormDialogProps<T> {
    open: boolean
    onOpenChange: (open: boolean) => void
    editing?: T
}

export interface CmsRowActionsProps<T> {
    /** 整行：交给域的对话框，编辑表单要能回填所有字段 */
    row: T
    status: CmsStatus
    /** 确认框标题里指代这条记录的文案（运营位/导航用标题，词条用词条名） */
    label: string
    /** 标题里的记录名词，拼成「停用词条「猜你喜欢」」；缺省则不带（「停用「首页导航」」） */
    noun?: string
    /** 启停两档各自的后果说明：必须说清「前台会怎样」，这是运营改完立刻生效的东西 */
    hints: { disable: string; enable: string }
    /** 状态写入：由调用点包各域的 mutation（成功关面，失败保持打开可重试） */
    submit: (status: CmsStatus) => Promise<unknown>
    pending: boolean
    Dialog: ComponentType<CmsFormDialogProps<T>>
}

/**
 * CMS 行的两个动作：编辑 + 启停。
 *
 * 启停必过二次确认——它动的是前台正在展示的内容，且是「停用即隐藏、不做物理删除」的
 * 唯一开关（没有删除按钮可撤回误判）。文案由调用点给，因为三张表停用的后果不一样：
 * 导航少一个入口、运营位少一块图、词条少一个推荐 tab。
 */
export function CmsRowActions<T>({
    row,
    status,
    label,
    noun,
    hints,
    submit,
    pending,
    Dialog,
}: CmsRowActionsProps<T>) {
    const [editOpen, setEditOpen] = useState(false)
    const enabled = status === "ENABLED"
    const verb = enabled ? "停用" : "启用"

    function toggleStatus() {
        const nextStatus: CmsStatus = enabled ? "DISABLED" : "ENABLED"
        void confirm({
            title: `${verb}${noun ?? ""}「${label}」`,
            description: enabled ? hints.disable : hints.enable,
            confirmText: `确认${verb}`,
            tone: enabled ? "destructive" : "default",
            action: () => submit(nextStatus),
        })
    }

    return (
        <div className="flex justify-end gap-1">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditOpen(true)}
            >
                <PencilIcon data-slot="icon" />
                编辑
            </Button>
            <Dialog
                open={editOpen}
                onOpenChange={setEditOpen}
                editing={row}
            />
            <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={toggleStatus}
            >
                {pending && <Spinner />}
                {verb}
            </Button>
        </div>
    )
}
