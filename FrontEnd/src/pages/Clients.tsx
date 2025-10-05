export default function Clients() {
  return (
    <div>
      <h1>Clients (stub)</h1>
      <input placeholder="Search clients" aria-label="Search clients" />
      <button>Next</button>
      <label htmlFor="rows">Rows per page</label>
      <select id="rows" aria-label="Rows per page">
        <option>25</option>
        <option>50</option>
      </select>
    </div>
  );
}

