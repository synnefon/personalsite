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

// Each level's vertical dangles from the end of its parent label, so
// positions are counts of monospace chars plus header letter-spaces.
// 0.12em tracks the .proj-subheader letter-spacing.
const chx = ({ chs, sp }) => `calc(${chs}ch + ${+(sp * 0.12).toFixed(3)}em)`;

// Lines for one row, positioned absolutely. `ancestors` holds one entry
// per level above: its line x, and whether that ancestor has more
// siblings below (so its line continues through this row). `x` is this
// row's own line; the tail is `pipe` for spacer rows, or the row's
// connector: `branch` (curve into the label) plus a continuing pipe
// when siblings follow (`tee`). `dangleX` positions the line out to
// this row's children; deriving it from the same char counts as the
// pipes keeps the joint exact in every browser.
const TreeLines = ({ ancestors, x, tail, dangleX }) => {
  const hasBranch = tail === "tee" || tail === "branch";
  return (
    <span
      className="tree-lines"
      aria-hidden="true"
      style={hasBranch ? { width: chx({ chs: x.chs + 2.5, sp: x.sp }) } : undefined}
    >
      {ancestors.map(
        (a, i) =>
          a.more && <span key={i} className="pipe" style={{ "--x": chx(a.x) }} />
      )}
      {(tail === "pipe" || tail === "tee") && (
        <span className="pipe" style={{ "--x": chx(x) }} />
      )}
      {hasBranch && <span className="branch" style={{ "--x": chx(x) }} />}
      {dangleX && <span className="dangle" style={{ "--x": chx(dangleX) }} />}
    </span>
  );
};

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

const renderNodes = (nodes, ancestors, x) =>
  nodes.map((node, i) => {
    const hasMoreSiblings = i < nodes.length - 1;
    const labelLen = (node.title ?? "").length;
    // content offset + label + dangle run
    const childX =
      node.children?.length > 0
        ? { chs: x.chs + 2.5 + labelLen + 2.5, sp: x.sp + labelLen }
        : null;
    return (
      <Fragment key={`${node.title ?? node.content}-${i}`}>
        {(node.type === types.section || i === 0) && (
          <div className="tree-row spacer">
            <TreeLines ancestors={ancestors} x={x} tail="pipe" />
          </div>
        )}
        <div
          className={`tree-row${node.type === types.section ? " section" : ""}`}
          id={node.id}
        >
          <TreeLines
            ancestors={ancestors}
            x={x}
            tail={hasMoreSiblings ? "tee" : "branch"}
            dangleX={childX}
          />
          <NodeContent node={node} />
        </div>
        {childX &&
          renderNodes(
            node.children,
            [...ancestors, { more: hasMoreSiblings, x }],
            childX
          )}
      </Fragment>
    );
  });

// Renders one nested data structure as an ascii tree. Nodes are plain
// data ({ type, title, content?, desc?, href?, to?, audio?, id?,
// children? }); every level follows the same rules. The root's row
// renders unprefixed.
export default function AsciiTree({ root }) {
  const rootLen = (root.title ?? "").length;
  const rootChildX =
    root.children?.length > 0 ? { chs: rootLen + 2.5, sp: rootLen } : null;
  return (
    <div className="ascii-tree">
      <div className="tree-row root" id={root.id}>
        {rootChildX && <TreeLines ancestors={[]} dangleX={rootChildX} />}
        <NodeContent node={root} />
      </div>
      {rootChildX && renderNodes(root.children, [], rootChildX)}
    </div>
  );
}
