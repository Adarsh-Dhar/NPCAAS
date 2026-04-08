'use client'

import React from 'react'

interface RetroButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'green' | 'magenta' | 'cyan' | 'yellow' | 'orange' | 'red' | 'blue'
  size?: 'sm' | 'md' | 'lg'
}

const variantClasses = {
  green: 'bg-green-500 border-green-700 text-black hover:bg-green-600',
  magenta: 'bg-pink-500 border-pink-700 text-white hover:bg-pink-600',
  cyan: 'bg-cyan-500 border-cyan-700 text-black hover:bg-cyan-600',
  yellow: 'bg-yellow-500 border-yellow-700 text-black hover:bg-yellow-600',
  orange: 'bg-orange-500 border-orange-700 text-black hover:bg-orange-600',
  red: 'bg-red-500 border-red-700 text-white hover:bg-red-600',
  blue: 'bg-blue-500 border-blue-700 text-white hover:bg-blue-600',
}

const sizeClasses = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-6 py-2 text-sm',
  lg: 'px-8 py-4 text-base',
}

const RetroButton = React.forwardRef<HTMLButtonElement, RetroButtonProps>(
  (
    { variant = 'cyan', size = 'md', className = '', ...props },
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
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `}
        style={{
          boxShadow: '4px 4px 0px 0px rgba(255, 255, 255, 1)',
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'translate(4px, 4px)'
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.boxShadow = '4px 4px 0px 0px rgba(255, 255, 255, 1)'
          e.currentTarget.style.transform = 'translate(0, 0)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '4px 4px 0px 0px rgba(255, 255, 255, 1)'
          e.currentTarget.style.transform = 'translate(0, 0)'
        }}
        {...props}
      />
    )
  }
)

RetroButton.displayName = 'RetroButton'

export default RetroButton
