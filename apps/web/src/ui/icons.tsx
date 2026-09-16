import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const stroke = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function CloseIcon(props: IconProps) {
  return (
    <svg {...stroke} {...props}>
      <path d="M6 18 18 6M6 6l12 12" />
    </svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...stroke} {...props}>
      <path d="m5 12 5 5L20 7" />
    </svg>
  )
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...stroke} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 8h.01" />
    </svg>
  )
}

export function SuccessIcon(props: IconProps) {
  return (
    <svg {...stroke} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  )
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...stroke} {...props}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

/** 演出の切り替え */
export function SparkleIcon(props: IconProps) {
  return (
    <svg {...stroke} {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" />
    </svg>
  )
}

/** 席と席の間に置く、手番が回る向きの矢印。反時計回りは左向きにする */
export function TurnArrowIcon({ direction, style, ...props }: IconProps & { direction: 1 | -1 }) {
  return (
    <svg {...stroke} {...props} style={{ ...style, transform: direction === -1 ? 'scaleX(-1)' : undefined }}>
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  )
}

/** 手番の向き。反時計回りは左右反転して表す */
export function RotateIcon({ direction, style, ...props }: IconProps & { direction: 1 | -1 }) {
  return (
    <svg {...stroke} {...props} style={{ ...style, transform: direction === -1 ? 'scaleX(-1)' : undefined }}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v6h-6" />
    </svg>
  )
}
