/**
 * One list for both layouts (Req 21.11): a table with column headers from 768px, stacked cards with labelled lines
 * ("Time: 14:30 IST") at 767px and below. admin.css switches the layout; each `Cell` carries its visible line label.
 */
export function StaffTable({ label, headers, children }) {
  return (
    <table className="staff-table">
      <caption className="sr-only">{label}</caption>
      <thead><tr>{headers.map((header, i) => <th key={i} scope="col">{header}</th>)}</tr></thead>
      <tbody>{children}</tbody>
    </table>
  );
}

/** A table cell. `label` shows only on the phone card; `title` marks the card's first, bold line. */
export function Cell({ label, title = false, children }) {
  return (
    <td className={title ? 'cell-title' : undefined}>
      {label && <span className="cell-label">{label}: </span>}
      {children}
    </td>
  );
}
