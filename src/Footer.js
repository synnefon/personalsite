import "./styles/app.css";

export default function Footer() {
  return (
    <div
      id="footer"
      className="home-colors"
      onClick={() => {
        sessionStorage.clear();
        window.location.reload();
      }}
      style={{ cursor: "pointer" }}
    >
      © connor hopkins, {new Date().getFullYear()}
    </div>
  );
}
