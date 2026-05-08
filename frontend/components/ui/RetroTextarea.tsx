import React from 'react'

interface RetroTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  borderColor?: 'cyan' | 'orange' | 'purple' | 'yellow' | 'red' | 'green' | 'magenta' | 'blue'
  label?: string
}

const RetroTextarea = React.forwardRef<HTMLTextAreaElement, RetroTextareaProps>(
  ({ borderColor = 'blue', label, className = '', style, ...props }, ref) => {
    const [focused, setFocused] = React.useState(false)
    const isCrimson = borderColor === 'purple' || borderColor === 'magenta' || borderColor === 'red'

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {label && (
          <label className="font-condensed" style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.5)',
          }}>
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`font-body ${className}`.trim()}
          style={{
            width: '100%',
            backgroundColor: focused ? 'rgba(216,49,91,0.05)' : 'rgba(255,255,255,0.04)',
            color: '#ffffff',
            border: '1px solid',
            borderColor: focused
              ? (isCrimson ? 'rgba(216,49,91,0.7)' : 'rgba(255,255,255,0.35)')
              : (isCrimson ? 'rgba(216,49,91,0.25)' : 'rgba(255,255,255,0.12)'),
            borderRadius: 0,
            padding: '0.6rem 0.875rem',
            fontSize: '0.875rem',
            outline: 'none',
            transition: 'all 0.2s ease',
            resize: 'vertical',
            ...style,
          }}
          onFocus={e => { setFocused(true); props.onFocus?.(e) }}
          onBlur={e => { setFocused(false); props.onBlur?.(e) }}
          {...props}
        />
      </div>
    )
  }
)

RetroTextarea.displayName = 'RetroTextarea'

export default RetroTextarea