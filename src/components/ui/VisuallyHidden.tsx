/**
 * Visually hidden, but announced — 10 §8.2.
 *
 * NOT `display: none` and NOT `visibility: hidden`: both remove the element from the
 * accessibility tree, which is the opposite of what this is for. The clip-rect technique keeps
 * it in the tree and out of the layout.
 */
export function VisuallyHidden({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <span
      style={{
        position: "absolute",
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        clipPath: "inset(50%)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {children}
    </span>
  );
}
