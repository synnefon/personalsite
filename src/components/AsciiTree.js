import { Fragment, useState } from "react";
import { Link } from "react-router-dom";

import headphonesIcon from "../assets/about/headphones.svg";
import { PersonalAudio } from "../util/Audio";

// Node types the tree knows how to render.
export const types = {
  section: "section",
  stringContent: "stringContent",
  linkContent: "linkContent",
  hrefContent: "hrefContent",
  audioContent: "audioContent",
};

const VS = "|";
const SP = " ";
const LN = "o- ";

// `ancestors` holds one flag per level above: true when that ancestor
// has more siblings below, so its pipe continues; false leaves a gap.
const indentText = (ancestors) =>
  SP + ancestors.map((more) => (more ? `${VS}   ` : "    ")).join("");
const spacerText = (ancestors) => indentText(ancestors) + VS;
const prefixText = (ancestors) => indentText(ancestors) + LN;

// One shared player so starting a clip stops the previous one
const sfx = new PersonalAudio();
// Clears the wiggle on whichever row is currently playing
let stopCurrentAudio = null;

const AudioNode = ({ node }) => {
  const [playing, setPlaying] = useState(false);

  const clear = () => {
    setPlaying(false);
    stopCurrentAudio = null;
  };

  const toggle = () => {
    if (playing) {
      sfx.pause();
      clear();
      return;
    }
    if (stopCurrentAudio) stopCurrentAudio();
    sfx.src = node.audio;
    sfx.onended = clear;
    sfx.onpause = () => {
      // Ignore the stale pause fired while switching between clips
      if (sfx.isPlaying()) return;
      clear();
    };
    sfx.play();
    setPlaying(true);
    stopCurrentAudio = () => setPlaying(false);
  };

  return (
    <div className={`audio-fact ${playing ? "playing" : ""}`} onClick={toggle}>
      <p className="tree-text">
        {node.title ? (
          <span className="tree-text-title">{node.title}: </span>
        ) : (
          ""
        )}
        {node.content}
      </p>
      <img
        src={headphonesIcon}
        alt="play audio"
        className="audio-hint"
        draggable={false}
      />
    </div>
  );
};

const NodeContent = ({ node }) => {
  switch (node.type) {
    case types.section:
      return <span className="proj-subheader">{node.title}</span>;
    case types.stringContent:
      return (
        <p className="tree-text">
          {node.title ? (
            <span className="tree-text-title">{node.title}: </span>
          ) : (
            ""
          )}
          {node.href ? (
            <a className="tree-inline-link" href={node.href} rel="noreferrer">
              {node.content}
            </a>
          ) : (
            node.content
          )}
        </p>
      );
    case types.linkContent:
      return (
        <Link className="link" to={node.to} rel="noreferrer">
          <LinkParts node={node} />
        </Link>
      );
    case types.hrefContent:
      return (
        <a className="link" href={node.href} rel="noreferrer">
          <LinkParts node={node} />
        </a>
      );
    case types.audioContent:
      return <AudioNode node={node} />;
    default:
      return null;
  }
};

const LinkParts = ({ node }) => (
  <>
    <p className="link-text">{node.title}</p>
    {node.desc && <p className="tooltip-text">{node.desc}</p>}
  </>
);

const renderNodes = (nodes, ancestors) =>
  nodes.map((node, i) => {
    const hasMoreSiblings = i < nodes.length - 1;
    return (
      <Fragment key={`${node.title ?? node.content}-${i}`}>
        {(node.type === types.section || i === 0) && (
          <div className="tree-row spacer">{spacerText(ancestors)}</div>
        )}
        <div
          className="tree-row"
          id={node.id}
          style={{ "--tree-depth": ancestors.length }}
          data-pipes={
            node.type === types.section
              ? undefined
              : (spacerText(ancestors) + "\n").repeat(12)
          }
        >
          <span className="tree-prefix">{prefixText(ancestors)}</span>
          <NodeContent node={node} />
        </div>
        {node.children?.length > 0 &&
          renderNodes(node.children, [...ancestors, hasMoreSiblings])}
      </Fragment>
    );
  });

// Renders one nested data structure as an ascii tree. Nodes are plain
// data ({ type, title, content?, desc?, href?, to?, audio?, id?,
// children? }); every level follows the same rules. The root's row
// renders unprefixed.
export default function AsciiTree({ root }) {
  return (
    <div className="ascii-tree">
      <div className="tree-row root" id={root.id}>
        <NodeContent node={root} />
      </div>
      {root.children?.length > 0 && renderNodes(root.children, [])}
    </div>
  );
}
