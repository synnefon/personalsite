import React, { ReactElement, ReactNode } from "react";

type MenuBarProps = {
  children: ReactNode;
};

/** Fixed bar pinned to the bottom of the screen, layered above the canvas. */
export default function MenuBar({ children }: MenuBarProps): ReactElement {
  return <div className="dendrites-menubar">{children}</div>;
}
