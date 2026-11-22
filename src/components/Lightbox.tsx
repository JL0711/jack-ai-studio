import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/I18nProvider';
import { ArrowLeftIcon, CloseIcon } from './Icons';

export interface LightboxImage {
  src: string;
  alt: string;
}

/** Full-screen image viewer: arrows or ←/→ to move, Esc or the backdrop to close. */
export function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: LightboxImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const closeRef = useRef<HTMLButtonElement>(null);
  const count = images.length;
  const go = useCallback((delta: number) => onIndex((index + delta + count) % count), [index, count, onIndex]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const image = images[index];
  if (!image) return null;

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={image.alt} onClick={onClose}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-count">{t('lightbox.count', { n: index + 1, total: count })}</span>
        <a href={image.src} target="_blank" rel="noopener" className="lightbox-open">
          {t('lightbox.open')}
        </a>
        <button ref={closeRef} type="button" className="lightbox-btn" onClick={onClose} aria-label={t('lightbox.close')}>
          <CloseIcon width={20} height={20} />
        </button>
      </div>
      <figure className="lightbox-figure" onClick={(e) => e.stopPropagation()}>
        <img key={image.src} src={image.src} alt={image.alt} />
        <figcaption>{image.alt}</figcaption>
      </figure>
      {count > 1 && (
        <>
          <button
            type="button"
            className="lightbox-btn lightbox-prev"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
            aria-label={t('lightbox.prev')}
          >
            <ArrowLeftIcon width={22} height={22} />
          </button>
          <button
            type="button"
            className="lightbox-btn lightbox-next"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
            aria-label={t('lightbox.next')}
          >
            <ArrowLeftIcon width={22} height={22} style={{ transform: 'scaleX(-1)' }} />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
