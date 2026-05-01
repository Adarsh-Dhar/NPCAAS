'use client'

import React from 'react'

interface RetroButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'green' | 'magenta' | 'cyan' | 'yellow' | 'orange' | 'red' | 'blue' | 'purple'
  size?: 'sm' | 'md' | 'lg'
}

// Map old variant names to new design system classes
const variantStyles: Record<string, React.CSSProperties> = {
  blue: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.25)',
    color: '#ffffff',
  },
  purple: {
    backgroundColor: 'rgba(216,49,91,0.12)',
    borderColor: 'rgba(216,49,91,0.5)',
    color: '#ffffff',
  },
  magenta: {
    backgroundColor: '#D8315B',
    borderColor: '#D8315B',
    color: '#ffffff',
  },
  cyan: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.2)',
    color: 'rgba(255,255,255,0.85)',
  },
  green: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.2)',
    color: 'rgba(255,255,255,0.85)',
  },
  red: {
    backgroundColor: 'rgba(216,49,91,0.15)',
    borderColor: 'rgba(216,49,91,0.6)',
    color: '#ffffff',
  },
  yellow: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.2)',
    color: 'rgba(255,255,255,0.85)',
  },
  orange: {
    backgroundColor: '#D8315B',
    borderColor: '#D8315B',
    color: '#ffffff',
  },
}

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { padding: '0.375rem 0.875rem', fontSize: '0.7rem' },
  md: { padding: '0.5rem 1.25rem', fontSize: '0.75rem' },
  lg: { padding: '0.75rem 2rem', fontSize: '0.8rem' },
}

const RetroButton = React.forwardRef<HTMLButtonElement, RetroButtonProps>(
  ({ variant = 'blue', size = 'md', className = '', style, ...props }, ref) => {
    const [hovered, setHovered] = React.useState(false)
    const [pressed, setPressed] = React.useState(false)

    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 400,
      letterSpacing: '0.06em',
      textTransform: 'uppercase',
      border: '2px solid',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      borderRadius: 0,
      outline: 'none',
      position: 'relative',
      overflow: 'hidden',
      ...variantStyles[variant],
      ...sizeStyles[size],
    }

    if (hovered && !props.disabled) {
      if (variant === 'magenta' || variant === 'orange') {
        base.backgroundColor = '#D8315B'
        base.boxShadow = '0 0 20px rgba(216,49,91,0.4)'
      } else if (variant === 'blue' || variant === 'cyan' || variant === 'green' || variant === 'yellow') {
        base.borderColor = 'rgba(255,255,255,0.35)'
        base.color = '#ffffff'
        base.backgroundColor = 'rgba(255,255,255,0.06)'
      } else if (variant === 'purple' || variant === 'red') {
        base.backgroundColor = 'rgba(216,49,91,0.18)'
        base.boxShadow = '0 0 16px rgba(216,49,91,0.25)'
      }
    }

    if (pressed && !props.disabled) {
      base.transform = 'scale(0.97)'
    }

    if (props.disabled) {
      base.opacity = 0.4
      base.cursor = 'not-allowed'
    }

    return (
      <button
        ref={ref}
        className={`font-display ${className}`.trim()}
        style={{ ...base, ...style }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setPressed(false) }}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        {...props}
      />
    )
  }
)

RetroButton.displayName = 'RetroButton'

export default RetroButton