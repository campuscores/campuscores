/**
 * One staff list: stacked cards with labelled lines at <=767px and a table with column headers at >=768px
 * (Req 21.11). CSS shows one of the two and hides the other with `display: none`, so assistive technology meets
 * only the visible one. `columns` is `[{ label, cell(row) }]`; `actions(row)` renders the row's allowed controls.
 */
export default function DataList({ label, columns, rows, actions, rowKey = row => row.id }) {
  return (
    <>
      <ul className="data-cards" aria-label={label}>
        {rows.map(row => (
          <li key={rowKey(row)} className="data-card">
            {columns.map(column => <p key={column.label}><span className="data-label">{column.label}:</span> {column.cell(row)}</p>)}
            {actions && <div className="row-actions">{actions(row)}</div>}
          </li>
        ))}
      </ul>
      <table className="data-table">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {columns.map(column => <th key={column.label} scope="col">{column.label}</th>)}
            {actions && <th scope="col"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={rowKey(row)}>
              {columns.map(column => <td key={column.label}>{column.cell(row)}</td>)}
              {actions && <td><div className="row-actions">{actions(row)}</div></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
