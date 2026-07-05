import { useState, useEffect } from 'react';
import { MessageCircleIcon, XIcon } from '../ui/Icons';
import ChatPanel from './ChatPanel';

export default function ChatBubble() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-lumin-ai', handleOpen);
    return () => window.removeEventListener('open-lumin-ai', handleOpen);
  }, []);

  return (
    <>
      {isOpen && <ChatPanel onClose={() => setIsOpen(false)} />}
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-2 z-[60] inline-flex h-11 w-11 items-center justify-center rounded-full bg-text-primary text-white shadow-xl transition-all duration-150 hover:scale-105 hover:bg-primary-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:ring-offset-2 md:bottom-6 md:right-6 md:h-14 md:w-14"
        aria-label={isOpen ? 'Đóng Lumin AI' : 'Mở Lumin AI'}
      >
        {isOpen ? <XIcon className="h-6 w-6" /> : <MessageCircleIcon className="h-6 w-6" />}
      </button>
    </>
  );
}
