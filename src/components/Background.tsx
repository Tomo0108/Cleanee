/**
 * Ambient backdrop behind the glass surfaces: two large, very soft light fields tinted
 * by the current module that drift slowly (like a macOS dynamic wallpaper).
 * With a native window material the OS backdrop shows through instead.
 */
export function Background() {
  return (
    <div className="bg-fx" aria-hidden>
      <div className="ambient">
        <i className="f1" />
        <i className="f2" />
      </div>
    </div>
  );
}
