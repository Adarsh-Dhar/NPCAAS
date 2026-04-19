import React from 'react'

interface RetroRangeSliderProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  borderColor?: 'cyan' | 'orange' | 'purple' | 'yellow' | 'red' | 'green' | 'magenta' | 'blue'
  value?: number | string | readonly string[]
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
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

const RetroRangeSlider = React.forwardRef<
  HTMLInputElement,
  RetroRangeSliderProps
>(
  ({ label, borderColor = 'blue', value, onChange, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <div className="flex justify-between">
            <label className="text-xs font-bold uppercase text-white">
              {label}
            </label>
            <span className="text-xs font-bold text-blue-400">{value}</span>
          </div>
        )}
        <div className={`border-4 rounded-none p-3 bg-black ${borderClasses[borderColor]}`}>
          <input
            ref={ref}
            type="range"
            value={value}
            onChange={onChange}
            className={`
              w-full h-3 bg-slate-900 rounded-none cursor-pointer
              appearance-none
              ${className}
            `}
            style={{
              accentColor: '#3b82f6',
            }}
            {...props}
          />
        </div>
      </div>
    )
  }
)

RetroRangeSlider.displayName = 'RetroRangeSlider'

export default RetroRangeSlider
