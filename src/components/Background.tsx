/**
 * Ambient backdrop behind the glass surfaces: large, very soft light fields tinted by the
 * current module. Each drifts slowly and fades in and out on its own cycle, so the light
 * crossfades between them (like a macOS dynamic wallpaper).
 * With a native window material the OS backdrop shows through instead.
 */
export function Background() {
  return (
    <div className="bg-fx" aria-hidden>
      <div className="ambient">
        <i className="f1" />
        <i className="f2" />
        <i className="f3" />
      </div>
    </div>
  );
}
