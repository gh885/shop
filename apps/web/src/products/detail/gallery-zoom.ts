export const ZOOM = 2.5

export function clampCenter(v: number, half: number): number {
    return Math.min(1 - half, Math.max(half, v))
}

/** 原图比例 f → background-position 百分比：两者不是一回事，p = (z·f − 0.5) / (z − 1) */
export function bgPos(f: number, z: number): string {
    return `${((z * f - 0.5) / (z - 1)) * 100}%`
}

export interface LensGeometry {
    fx: number
    fy: number
    lensX: number
    lensY: number
    backgroundPosition: string
}

export function lensGeometry(input: {
    naturalAspect: number
    frameWidth: number
    frameHeight: number
    pointerX: number
    pointerY: number
    zoom?: number
}): LensGeometry {
    const { naturalAspect: nat, frameWidth, frameHeight, pointerX, pointerY } = input
    const zoom = input.zoom ?? ZOOM
    const frameAspect = frameWidth / frameHeight
    const visX = Math.min(1, frameAspect / nat)
    const visY = Math.min(1, nat / frameAspect)
    const lensX = 1 / zoom / visX
    const lensY = nat / zoom / visY
    const fx = clampCenter(pointerX, lensX / 2)
    const fy = clampCenter(pointerY, lensY / 2)
    const nx = 0.5 + (fx - 0.5) * visX
    const ny = 0.5 + (fy - 0.5) * visY
    return {
        fx,
        fy,
        lensX,
        lensY,
        backgroundPosition: `${bgPos(nx, zoom)} ${bgPos(ny, zoom / nat)}`,
    }
}
