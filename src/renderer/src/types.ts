// main / preload と共有する型は src/shared/types.ts にある。ここは renderer 専用の型
export type {
  CustomEmoji,
  MastodonAccount,
  MediaAttachment,
  OAuthCallbackData,
  PostHistory,
  Visibility
} from '../../shared/types'

// Spark particle types
export interface Spark {
  id: number
  x: number
  y: number
  angle: number
  speed: number
  size: number
  color: string
}

export interface Particle extends Spark {
  vx: number
  vy: number
  life: number
  decay: number
  px: number
  py: number
}
