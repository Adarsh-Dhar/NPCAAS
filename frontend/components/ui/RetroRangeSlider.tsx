import React from 'react'

interface RetroRangeSliderProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  borderColor?: 'cyan' | 'orange' | 'purple' | 'yellow' | 'red' | 'green' | 'magenta' | 'blue'
  value?: number | string | readonly string[]
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const borderClasses = {
  cyan: 'border-white/20',
  orange: 'border-white/20',
  purple: 'border-crimson',
  yellow: 'border-white/20',
  red: 'border-crimson',
  green: 'border-white/20',
  magenta: 'border-crimson',
  blue: 'border-white/20',
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
            <span className="text-xs font-bold text-crimson">{value}</span>
          </div>
        )}
        <div className={`border-2 rounded-none p-3 bg-black ${borderClasses[borderColor]}`}>
          <input
            ref={ref}
            type="range"
            value={value}
            onChange={onChange}
            className={`
              w-full h-3 bg-neutral-900 rounded-none cursor-pointer
              appearance-none
              ${className}
            `}
            style={{
              accentColor: '#D8315B',
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
