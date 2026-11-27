export function FormField({
  id,
  label,
  type = 'text',
  name,
  autoComplete,
  inputMode,
  enterKeyHint,
  spellCheck,
  autoCapitalize,
  autoCorrect,
  autoFocus = false,
  required = false,
  disabled = false,
  min,
  max,
  step,
  maxLength,
  placeholder,
  hint,
  validationMessage,
  multiline = false,
  rows = 3,
  inputRef,
  value,
  onChange,
  trailingAction = null,
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = validationMessage ? `${id}-error` : undefined
  const sharedClasses =
    'form-control w-full rounded-[5px] border border-input-border bg-surface px-3.5 py-2.5 text-[max(1rem,1em)] text-ink placeholder:text-ink-muted/70 transition-colors hover:border-ink disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70 sm:text-sm'

  return (
    <div className="field-group flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-sm font-medium leading-[1.4] text-ink transition-colors"
      >
        {label}
      </label>
      {hint ? (
        <span id={hintId} className="text-xs leading-[1.4] text-ink-muted">
          {hint}
        </span>
      ) : null}
      {multiline ? (
        <textarea
          ref={inputRef}
          id={id}
          name={name}
          rows={rows}
          autoFocus={autoFocus}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid="false"
          aria-describedby={hintId}
          data-error={errorId}
          value={value}
          onChange={onChange}
          className={`${sharedClasses} min-h-24 resize-y`}
        />
      ) : (
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            id={id}
            name={name}
            type={type}
            autoComplete={autoComplete}
            inputMode={inputMode}
            enterKeyHint={enterKeyHint}
            spellCheck={spellCheck}
            autoCapitalize={autoCapitalize}
            autoCorrect={autoCorrect}
            autoFocus={autoFocus}
            required={required}
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            maxLength={maxLength}
            placeholder={placeholder}
            aria-invalid="false"
            aria-describedby={hintId}
            data-error={errorId}
            value={value}
            onChange={onChange}
            className={`${sharedClasses} min-h-11 ${trailingAction ? 'pe-18' : ''}`}
          />
          {trailingAction ? (
            <div className="absolute inset-e-1.5 flex items-center">
              {trailingAction}
            </div>
          ) : null}
        </div>
      )}
      {validationMessage ? (
        <div id={errorId} className="field-error-msg">
          <svg
            role="img"
            aria-label="Error"
            viewBox="0 0 16 16"
            className="mt-0.5 size-3.5 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <circle cx="8" cy="8" r="6.25" />
            <path d="M8 4.75v3.5M8 11h.01" strokeLinecap="square" />
          </svg>
          <span>{validationMessage}</span>
        </div>
      ) : null}
    </div>
  )
}
