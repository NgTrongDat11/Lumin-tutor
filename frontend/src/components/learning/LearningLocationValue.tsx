import { getLearningLocationUrl } from '../../utils/learningLocation';
import { LinkIcon } from '../ui/Icons';

interface LearningLocationValueProps {
  value: string;
  className?: string;
  linkLabel?: string;
}

export function LearningLocationValue({
  value,
  className = '',
  linkLabel = 'Vào phòng học',
}: LearningLocationValueProps) {
  const url = getLearningLocationUrl(value);

  if (!url) {
    return <span className={`text-sm font-bold text-text-primary ${className}`}>{value}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(event) => event.stopPropagation()}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-sm font-bold text-primary-700 transition-colors hover:border-primary-300 hover:bg-primary-100 ${className}`}
    >
      <LinkIcon className="h-4 w-4" />
      {linkLabel}
    </a>
  );
}
