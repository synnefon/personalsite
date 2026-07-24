import { useLocation } from "react-router-dom";

import { SECTIONS } from "./home/Home";

import "./styles/app.css";

export default function Footer() {
  const location = useLocation();

  // On home the copyright lives under the lenny face instead
  const onHome =
    location.pathname === "/" ||
    SECTIONS.some((s) => location.pathname === `/${s.slug}`);
  if (onHome) return null;

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
