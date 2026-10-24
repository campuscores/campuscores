import './EmptyState.css';

/** Decorative local illustration beside readable HTML; only a rendered empty result loads an image. */
export default function EmptyState({ asset, title, children, id }) {
  const base = `/assets/${asset}`;
  return <div className="public-empty" id={id}>
    <img src={`${base}.svg`} srcSet={`${base}-240.webp 240w, ${base}-480.webp 480w`} sizes="(max-width: 767px) 180px, 240px" width="240" height="128" alt="" loading="lazy" decoding="async" />
    <div><h3>{title}</h3><p>{children}</p></div>
  </div>;
}
