/**
 * True when running inside a native desktop shell, false in a regular browser.
 * The shell injects window.desktopBridge / window.nativeApi before any web-app
 * code executes, so this is reliable at module load time.
 */
export const isDesktopShell =
  typeof window !== "undefined" &&
  (window.desktopBridge !== undefined || window.nativeApi !== undefined);

function readBooleanEnvFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value === "1" || value.toLowerCase() === "true";
}

export const isNativeApiDisabledByEnv = readBooleanEnvFlag(
  import.meta.env.VITE_NATIVE_API_DISABLED,
);

export const isStandaloneWebDev = !isDesktopShell && isNativeApiDisabledByEnv;
