import { NEXT_SOUND_LEVEL, SOUND_LEVEL_LABEL, useSound } from '../sound/store'
import { cx } from '../ui/cx'
import { SoundIcon } from '../ui/icons'
import { Button } from './Button'

/** 効果音の大きさを、押すたびに 大→小→オフ と切り替える */
export function SoundToggle() {
  const level = useSound((s) => s.level)
  const setLevel = useSound((s) => s.setLevel)
  return (
    <Button
      variant="subtle"
      size="sm"
      aria-label={`音: ${SOUND_LEVEL_LABEL[level]}(押すと${SOUND_LEVEL_LABEL[NEXT_SOUND_LEVEL[level]]}に切り替え)`}
      onClick={() => setLevel(NEXT_SOUND_LEVEL[level])}
      className="px-2 sm:px-3"
    >
      <SoundIcon muted={level === 'off'} className={cx('h-4 w-4', level === 'off' ? 'text-slate-400' : 'text-primary-500')} />
      <span className="hidden sm:inline">音:</span>
      {SOUND_LEVEL_LABEL[level]}
    </Button>
  )
}
