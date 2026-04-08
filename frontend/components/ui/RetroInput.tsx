import React from 'react'

interface RetroInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  borderColor?: 'cyan' | 'orange' | 'purple' | 'yellow' | 'red' | 'green' | 'magenta' | 'blue'
  label?: string
}

const borderClasses = {
  cyan: 'border-cyan-400',
  orange: 'border-orange-400',
  purple: 'border-purple-400',
  yellow: 'border-yellow-400',
  red: 'border-red-400',
  green: 'border-green-400',
  magenta: 'border-pink-400',
  blue: 'border-blue-400',
}

const RetroInput = React.forwardRef<HTMLInputElement, RetroInputProps>(
  ({ borderColor = 'cyan', label, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <label className="text-xs font-bold uppercase text-white">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            w-full bg-gray-900 text-white border-4 rounded-none px-3 py-2 
            focus:outline-none focus:ring-0 focus:bg-gray-800
            transition-colors placeholder-gray-600
            ${borderClasses[borderColor]}
            ${className}
          `}
          {...props}
        />
      </div>
    )
  }
)

RetroInput.displayName = 'RetroInput'

export default RetroInput
