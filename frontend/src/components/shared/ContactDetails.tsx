import { LocationMarkerIcon, MailIcon, PhoneIcon } from '../ui/Icons';

interface ContactDetailsProps {
  title: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  emptyMessage?: string;
  compact?: boolean;
  className?: string;
}

export default function ContactDetails({
  title,
  phone,
  email,
  address,
  emptyMessage,
  compact = false,
  className = '',
}: ContactDetailsProps) {
  const hasContact = Boolean(phone || email || address);

  if (!hasContact) {
    return emptyMessage ? (
      <div className={`rounded-lg border border-dashed border-border bg-surface-secondary px-3 py-2.5 ${className}`}>
        <p className="text-xs font-semibold text-text-tertiary">{emptyMessage}</p>
      </div>
    ) : null;
  }

  return (
    <div className={`rounded-lg border border-primary-100 bg-primary-50/70 ${compact ? 'px-3 py-2.5' : 'px-4 py-3.5'} ${className}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-primary-750">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {phone ? (
          <a
            href={`tel:${phone.replace(/\s+/g, '')}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-primary-750 shadow-xs transition-colors hover:bg-primary-100"
          >
            <PhoneIcon className="h-4 w-4 shrink-0" />
            <span>{phone}</span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-primary-600">Gọi</span>
          </a>
        ) : null}
        {email ? (
          <a
            href={`mailto:${email}`}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-text-secondary shadow-xs transition-colors hover:bg-primary-100 hover:text-primary-750"
          >
            <MailIcon className="h-4 w-4 shrink-0 text-primary-600" />
            <span className="truncate">{email}</span>
          </a>
        ) : null}
        {address ? (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-text-secondary shadow-xs">
            <LocationMarkerIcon className="h-4 w-4 shrink-0 text-primary-600" />
            <span className="truncate">{address}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}