import {DecodedStore} from './store/decoded'
import {frame, initialPlay} from './type'
import {Emitter} from './utils/Emitter'
import {AUTO_PLAY_VARS} from './utils/metaData'
import {Viewer} from './viewer'

interface PlayerOption {
    viewer: Viewer
    beginFrameNo?: number
    forword?: boolean
    rate?: number
    loop?: boolean
    autoplay?: initialPlay
}

type playerHeader = { width: number; height: number }

const isAutoPlayVar = (str: unknown): str is initialPlay =>
    AUTO_PLAY_VARS.includes(str as any)

export class Player extends Emitter<
    ['play', 'frameChange', 'pause', 'playended']
> {
    readonly viewer: Viewer
    readonly beginFrameNo: number
    readonly autoplay: initialPlay
    readonly playedFrameNos = new Set<number>()
    loopCount = 0
    playing = false
    currentKey?: string = void 0
    private i: number
    private t = 0

    constructor(option: PlayerOption) {
        super()
        this.viewer = option.viewer
        this.beginFrameNo =
            typeof option.beginFrameNo === 'number' ? option.beginFrameNo : 0
        this._forward = typeof option.forword === 'boolean' ? option.forword : true
        this._rate = typeof option.rate === 'number' ? option.rate : 1
        this._loop = typeof option.loop === 'boolean' ? option.loop : true
        this.autoplay = isAutoPlayVar(option.autoplay) ? option.autoplay : 'auto'
        this.i = this.beginFrameNo
    }

    private _rate: number

    get rate() {
        return this._rate
    }

    set rate(val: number) {
        if (val >= 0) {
            this._rate = val
        }
    }

    private _forward: boolean

    get forward() {
        return this._forward
    }

    set forward(val: boolean) {
        this._forward = val
    }

    private _loop: boolean

    get loop() {
        return this._loop
    }

    set loop(val: boolean) {
        this._loop = val
    }

    get currentImg() {
        return (
            (this.currentKey && DecodedStore.getDecodeData(this.currentKey)) || void 0
        )
    }

    get header(): playerHeader | void {
        const img = this.currentImg
        if (!img?.header) {
            return void 0
        }
        return {
            width: img.header.logicalScreenWidth,
            height: img.header.logicalScreenHeight
        }
    }

    get framsComplete() {
        return !!this.currentImg?.complete
    }

    get frameGroup() {
        return this.currentImg ? this.currentImg.frames : []
    }

    get readyStatus() {
        return this.currentKey
            ? DecodedStore.getDecodeStatus(this.currentKey)
            : 'none'
    }

    get currentFrame(): frame | void {
        return this.frameGroup[this.i]
    }

    get currentFrameNo() {
        return this.i
    }

    resetState = () => {
        clearTimeout(this.t)
        this.i = this.beginFrameNo
        this.loopCount = 0
        this.playing = false
        this.playedFrameNos.clear()
    }

    putFrame(flag: number) {
        const frame = this.frameGroup[flag]
        if (frame && frame.data !== this.viewer.currentImgData) {
            this.i = flag
            this.viewer.putDraft(frame.data, frame.leftPos, frame.topPos)
            this.viewer.drawDraft()
            this.playedFrameNos.add(this.i)
            this.emit('frameChange')
        }
        return frame
    }

    play = () => {
        if (this.playing) {
            return
        }
        this.playing = true
        this.goOn()
        this.emit('play')
    }

    pause = () => {
        this.playing = false
        this.emit('pause')
    }

    async prepare() {
        const setHeader = () => {
            const header = this.header
            if (header) {
                this.viewer.setDraftSize(header)
            }
            return !!header
        }
        if (!setHeader()) {
            await new Promise((resolve) => {
                const handler = () =>
                    setHeader() && resolve(DecodedStore.off('header', handler))
                DecodedStore.on('header', handler)
            })
        }
    }

    async switch(key: string) {
        this.resetState()
        this.currentKey = key
        await this.prepare()
        this.putFrame(0) // 封面
        this.play()
    }

    onError = () => {
        this.resetState()
    }

    /**
     * Gets the index of the frame "up next".
     * @returns {number}
     */
    private getNextFrameNo() {
        const length = this.frameGroup.length
        if (!length) {
            return length
        }
        const delta = this.forward ? 1 : -1
        const res = (this.i + delta + length) % length
        return res
    }

    private finish = () => {
        this.loopCount++
        if (this.loop) {
            this.goOn()
        } else {
            this.pause()
            this.emit('playended')
        }
    }

    private goOn = () => {
        if (!this.playing) return
        clearTimeout(this.t)

        const willPutNo = this.getNextFrameNo()
        const shouldPut = !(!this.framsComplete && willPutNo === 0)
        const currentFrame = shouldPut
            ? this.putFrame(willPutNo)
            : this.currentFrame
        const delay = currentFrame ? currentFrame.delay : 17
        const isComplete = this.framsComplete && this.getNextFrameNo() === 0
        this.t = window.setTimeout(
            isComplete ? this.finish : this.goOn,
            delay / this.rate
        )
    }
}
