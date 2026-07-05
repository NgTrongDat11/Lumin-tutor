import { forwardRef, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', id, ...rest }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-text-primary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={`w-full px-3.5 py-2.5 rounded-lg border text-sm transition-all duration-150 resize-y min-h-[80px]
            placeholder:text-text-tertiary
            focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500
            ${error
              ? 'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500'
              : 'border-border hover:border-text-tertiary'
            } ${className}`}
          {...rest}
        />
        {error && <p className="text-xs text-danger-600">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
export default Textarea;
