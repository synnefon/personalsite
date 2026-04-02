import './styles/app.css'

export default function Footer() {
  return (
    <div id="footer" onClick={() => { sessionStorage.clear(); window.location.reload(); }} style={{ cursor: "pointer" }}>© connor hopkins</div>
  );
}