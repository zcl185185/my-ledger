import { CircleDot, Ellipsis } from 'lucide-react';

export function PageCloseCapsule({ onClose, onMore }: { onClose: () => void; onMore: () => void }) {
  return (
    <div className="h-10 rounded-full bg-card border border-line shadow-sm flex items-center overflow-hidden">
      <button className="w-12 h-10 grid place-items-center" aria-label="更多" onClick={onMore}>
        <Ellipsis size={22} strokeWidth={2.4} />
      </button>
      <span className="w-px h-5 bg-line" aria-hidden />
      <button className="w-12 h-10 grid place-items-center" aria-label="关闭并返回资产管家" onClick={onClose}>
        <CircleDot size={22} strokeWidth={2.4} />
      </button>
    </div>
  );
}
