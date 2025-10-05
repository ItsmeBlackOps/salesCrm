export default function Logs() {
  return (
    <div>
      <h1>Logs (stub)</h1>
      <form>
        <label htmlFor="from">From</label>
        <input id="from" aria-label="From" />
        <label htmlFor="to">To</label>
        <input id="to" aria-label="To" />
        <label htmlFor="actor">Actor</label>
        <input id="actor" aria-label="Actor" />
        <label htmlFor="action">Action</label>
        <select id="action" aria-label="Action"><option>VIEW</option><option>DELETE</option></select>
        <button type="button">Apply</button>
      </form>
    </div>
  );
}

