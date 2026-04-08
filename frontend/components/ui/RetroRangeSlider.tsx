import React from 'react'

interface RetroRangeSliderProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  borderColor?: 'cyan' | 'orange' | 'purple' | 'yellow' | 'red' | 'green' | 'magenta' | 'blue'
  value?: number | string | readonly string[]
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
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

const RetroRangeSlider = React.forwardRef<
  HTMLInputElement,
  RetroRangeSliderProps
>(
  ({ label, borderColor = 'cyan', value, onChange, className = '', ...props }, ref) => {
    return (
      <div className="flex flex-col gap-2">
        {label && (
          <div className="flex justify-between">
            <label className="text-xs font-bold uppercase text-white">
              {label}
            </label>
            <span className="text-xs font-bold text-cyan-400">{value}</span>
          </div>
        )}
        <div className={`border-4 rounded-none p-3 bg-gray-900 ${borderClasses[borderColor]}`}>
          <input
            ref={ref}
            type="range"
            value={value}
            onChange={onChange}
            className={`
              w-full h-3 bg-gray-800 rounded-none cursor-pointer
              appearance-none
              ${className}
            `}
            style={{
              accentColor: '#06b6d4', // Cyan
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
