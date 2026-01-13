import linkedinIcon from "../assets/nav_icons/linkedin.svg";
import githubIcon from "../assets/nav_icons/github.svg";
import resumeIcon from "../assets/nav_icons/resume.svg";
import "../styles/socialIcons.css";

export default function SocialIcons() {
  return (
    <div className="social-icons">
      <a
        href="https://www.linkedin.com/in/connor-j-hopkins"
        target="_blank"
        rel="noreferrer"
        className="social-icon-link"
        aria-label="LinkedIn"
      >
        <img src={linkedinIcon} alt="LinkedIn" className="social-icon" />
        <span className="social-tooltip">linkedin</span>
      </a>
      <a
        href="https://docs.google.com/document/d/1A77LelAqhLE98pvkOYpHjUAs7l3LW-mcSQr-_MpbP6I"
        target="_blank"
        rel="noreferrer"
        className="social-icon-link"
        aria-label="Resume"
      >
        <img src={resumeIcon} alt="Resume" className="social-icon" />
        <span className="social-tooltip">resume</span>
      </a>
      <a
        href="https://github.com/synnefon"
        target="_blank"
        rel="noreferrer"
        className="social-icon-link"
        aria-label="GitHub"
      >
        <img src={githubIcon} alt="GitHub" className="social-icon" />
        <span className="social-tooltip">github</span>
      </a>
    </div>
  );
}
