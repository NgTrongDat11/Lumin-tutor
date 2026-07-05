import type { ReactNode } from 'react';

export function getSafeDocumentHref(fileUrl: string | null | undefined) {
  const value = fileUrl?.trim();
  if (!value) return null;

  // Accept: absolute URLs, known local paths, and any path starting with /
  if (
    /^https?:\/\//i.test(value) ||
    value.startsWith('/uploads/') ||
    value.startsWith('/seed/') ||
    value.startsWith('/api/')
  ) {
    return value;
  }

  // Fallback: if the value looks like a path (starts with / or has a file extension), allow it
  if (value.startsWith('/') || /\.\w{2,5}$/i.test(value)) {
    return value;
  }

  return null;
}

interface DocumentLinkProps {
  fileUrl: string | null | undefined;
  children?: ReactNode;
  className?: string;
  unavailableClassName?: string;
}

export default function DocumentLink({
  fileUrl,
  children = 'Xem tài liệu',
  className = 'text-xs font-semibold text-primary-600 hover:underline',
  unavailableClassName = 'text-xs font-semibold text-warning-600',
}: DocumentLinkProps) {
  const href = getSafeDocumentHref(fileUrl);

  if (!href) {
    return (
      <span className={unavailableClassName}>
        {fileUrl ? 'Tài liệu chưa có URL công khai' : 'Không có tài liệu'}
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}
