/** An endless, slowly scrolling strip of labels (pauses on hover, still with reduced motion). */
export function Marquee({ items, label }: { items: string[]; label: string }) {
  const list = (hidden: boolean) => (
    <ul className="marquee-track" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
  return (
    <div className="marquee" role="region" aria-label={label}>
      {list(false)}
      {list(true)}
    </div>
  );
}
