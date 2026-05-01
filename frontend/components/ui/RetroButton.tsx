'use client'

import React from 'react'

interface RetroButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'purple' | 'blue'
  size?: 'sm' | 'md' | 'lg'
}

const variantClasses = {
  green: 'bg-cyan-600 border-cyan-300 text-slate-950 hover:bg-cyan-500',
  magenta: 'bg-purple-700 border-fuchsia-300 text-white hover:bg-purple-600',
  cyan: 'bg-blue-600 border-cyan-300 text-white hover:bg-sky-600',
  yellow: 'bg-indigo-700 border-blue-300 text-blue-50 hover:bg-indigo-600',
  orange: 'bg-purple-700 border-cyan-300 text-blue-50 hover:bg-purple-600',
  red: 'bg-fuchsia-800 border-purple-200 text-white hover:bg-fuchsia-700',
  blue: 'bg-blue-600 border-blue-200 text-white hover:bg-blue-500',
}

const sizeClasses = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-6 py-2 text-sm',
  lg: 'px-8 py-4 text-base',
}

const RetroButton = React.forwardRef<HTMLButtonElement, RetroButtonProps>(
  (
    { variant = 'blue', size = 'md', className = '', ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={`
          border-4 font-bold rounded-none 
          transition-all duration-75 
          active:shadow-none active:translate-y-1 active:translate-x-1
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantClasses[variant as keyof typeof variantClasses]}
          ${sizeClasses[size]}
          ${className}
        `}
        style={{
          boxShadow: '4px 4px 0px 0px rgba(34, 211, 238, 0.75), 0 0 18px rgba(34, 211, 238, 0.14)',
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'translate(4px, 4px)'
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.boxShadow = '4px 4px 0px 0px rgba(34, 211, 238, 0.75), 0 0 18px rgba(34, 211, 238, 0.14)'
          e.currentTarget.style.transform = 'translate(0, 0)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '4px 4px 0px 0px rgba(34, 211, 238, 0.75), 0 0 18px rgba(34, 211, 238, 0.14)'
          e.currentTarget.style.transform = 'translate(0, 0)'
        }}
        {...props}
      />
    )
  }
)

RetroButton.displayName = 'RetroButton'

export default RetroButton
