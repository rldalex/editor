'use client'

import { uploadGLB } from '@maison-3d/glb-catalog'
import clsx from 'clsx'
import { useRef, useState } from 'react'
import { haConventionResolver } from './category-resolver'

type Phase = 'idle' | 'preparing' | 'detecting' | 'rendering' | 'storing' | 'error'

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  preparing: 'Analyse du GLB…',
  detecting: 'Détection auto…',
  rendering: 'Rendu thumbnail…',
  storing: 'Enregistrement…',
  error: '',
}

export function UploadZone() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    try {
      await uploadGLB(file, {
        resolver: haConventionResolver,
        onPhase: (p) => setPhase(p),
      })
      setPhase('idle')
    } catch (err) {
      setPhase('error')
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <div
      className={clsx(
        'flex shrink-0 flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-6 text-center transition-colors',
        dragOver ? 'border-primary/70 bg-primary/10' : 'border-border/50 bg-[#2C2C2E]',
        phase !== 'idle' && phase !== 'error' && 'pointer-events-none opacity-60',
      )}
      onDragLeave={() => setDragOver(false)}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files?.[0]
        if (file) void handleFile(file)
      }}
    >
      <input
        accept=".glb,.gltf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
        ref={inputRef}
        type="file"
      />
      <span className="font-medium text-foreground text-sm">
        {phase === 'idle'
          ? 'Glisse un .glb ici'
          : phase === 'error'
            ? 'Erreur'
            : PHASE_LABEL[phase]}
      </span>
      <span className="text-muted-foreground text-xs">ou</span>
      <button
        className="rounded-md bg-accent px-3 py-1.5 font-medium text-foreground text-xs hover:bg-accent/70"
        disabled={phase !== 'idle' && phase !== 'error'}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        Choisir un fichier
      </button>
      {error && <span className="text-red-400 text-xs">{error}</span>}
    </div>
  )
}
