import { useEffect, useRef } from 'react'
import type { Spark, Particle } from '../types'

interface SparkEffectProps {
  sparks: Spark[]
}

export default function SparkEffect({ sparks }: SparkEffectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number | null>(null)
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    const canvas = canvasRef.current!
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const handleResize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (sparks.length === 0) return

    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    // Add new particles
    const newParticles: Particle[] = sparks.map((s) => ({
      ...s,
      vx: Math.cos((s.angle * Math.PI) / 180) * s.speed * 0.016,
      vy: Math.sin((s.angle * Math.PI) / 180) * s.speed * 0.016 - 2,
      life: 1.0,
      decay: 0.03 + Math.random() * 0.04,
      px: s.x,
      py: s.y
    }))

    particlesRef.current = [...particlesRef.current, ...newParticles]

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      particlesRef.current = particlesRef.current.filter((p) => p.life > 0)

      for (const p of particlesRef.current) {
        ctx.save()
        ctx.globalAlpha = p.life
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8

        // Draw spark as elongated line
        ctx.beginPath()
        ctx.moveTo(p.px, p.py)
        ctx.lineTo(p.x, p.y)
        ctx.strokeStyle = p.color
        ctx.lineWidth = p.size * p.life
        ctx.stroke()

        // Draw bright core
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * p.life * 0.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        // Update
        p.px = p.x
        p.py = p.y
        p.x += p.vx * 60
        p.y += p.vy * 60
        p.vy += 0.15 // gravity
        p.life -= p.decay
      }

      if (particlesRef.current.length > 0) {
        animRef.current = requestAnimationFrame(animate)
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }
    }

    if (animRef.current) cancelAnimationFrame(animRef.current)
    animRef.current = requestAnimationFrame(animate)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [sparks])

  return <canvas ref={canvasRef} className="spark-canvas" />
}
