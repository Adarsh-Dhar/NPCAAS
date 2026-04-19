import React from 'react'

interface RetroInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  borderColor?: 'cyan' | 'orange' | 'purple' | 'yellow' | 'red' | 'green' | 'magenta' | 'blue'
  label?: string
}

const borderClasses = {
  cyan: 'border-blue-400',
  orange: 'border-blue-700',
  purple: 'border-purple-400',
  yellow: 'border-blue-500',
  red: 'border-purple-500',
  green: 'border-blue-600',
  magenta: 'border-purple-300',
  blue: 'border-blue-300',
}

const RetroInput = React.forwardRef<HTMLInputElement, RetroInputProps>(
  ({ borderColor = 'blue', label, className = '', ...props }, ref) => {
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
            w-full bg-black text-white border-4 rounded-none px-3 py-2 
            focus:outline-none focus:ring-0 focus:bg-slate-950
            transition-colors placeholder-slate-500
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
